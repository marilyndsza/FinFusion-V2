"""
LSTM-based forecasting for FinFusion.

This module trains a multivariate sequence model and then produces a
recursive 30-day forecast with deterministic pattern-aware post-processing
so the UI can display explainable, data-driven projections.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Dict, List, Optional, Tuple
import logging

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

_MODEL_CACHE: Dict[str, Dict] = {}


class LSTMForecaster:
    def __init__(self, window_size: int = 30, min_data_points: int = 60):
        self.window_size = window_size
        self.min_data_points = min_data_points
        self.model = None
        self.feature_scaler = None
        self.target_scaler = None
        self.feature_columns: List[str] = []
        self.training_frame = None
        self.seed_history = None
        self.diagnostics: Dict = {}
        self.patterns: Dict = {}
        self.is_trained = False

    def _compress_inactive_gaps(self, daily_spending: pd.DataFrame) -> pd.DataFrame:
        df = daily_spending.copy()
        df["date"] = pd.to_datetime(df["date"])
        df["total_amount"] = pd.to_numeric(df["total_amount"], errors="coerce").fillna(0.0)
        df = df.sort_values("date").reset_index(drop=True)

        if df.empty:
            return df

        keep = np.zeros(len(df), dtype=bool)
        active_idx = np.where(df["total_amount"].to_numpy() > 0)[0]

        if len(active_idx) == 0:
            return df.tail(max(self.window_size, 30)).reset_index(drop=True)

        context = max(self.window_size, 30)
        for idx in active_idx:
            start = max(0, idx - context)
            end = min(len(df), idx + context + 1)
            keep[start:end] = True

        compressed = df.loc[keep].copy().reset_index(drop=True)
        return compressed if not compressed.empty else df.copy()

    def _build_feature_frame(self, daily_spending: pd.DataFrame) -> pd.DataFrame:
        df = daily_spending.copy()
        df["date"] = pd.to_datetime(df["date"])
        df["total_amount"] = pd.to_numeric(df["total_amount"], errors="coerce").fillna(0.0)
        df = df.sort_values("date").reset_index(drop=True)

        df["rolling_avg_7"] = df["total_amount"].rolling(7, min_periods=1).mean()
        df["rolling_avg_30"] = df["total_amount"].rolling(30, min_periods=1).mean()
        df["rolling_std_7"] = df["total_amount"].rolling(7, min_periods=1).std().fillna(0.0)

        dow = df["date"].dt.dayofweek
        dom = df["date"].dt.day

        df["spend_log"] = np.log1p(df["total_amount"])
        df["rolling_avg_7_log"] = np.log1p(df["rolling_avg_7"])
        df["rolling_avg_30_log"] = np.log1p(df["rolling_avg_30"])
        df["rolling_std_7_log"] = np.log1p(df["rolling_std_7"])
        df["dow_sin"] = np.sin(2 * np.pi * dow / 7.0)
        df["dow_cos"] = np.cos(2 * np.pi * dow / 7.0)
        df["dom_sin"] = np.sin(2 * np.pi * (dom - 1) / 31.0)
        df["dom_cos"] = np.cos(2 * np.pi * (dom - 1) / 31.0)
        df["weekend_flag"] = (dow >= 5).astype(float)
        df["month_start_flag"] = (dom <= 5).astype(float)
        df["month_end_flag"] = (dom >= 26).astype(float)

        self.feature_columns = [
            "spend_log",
            "rolling_avg_7_log",
            "rolling_avg_30_log",
            "rolling_std_7_log",
            "dow_sin",
            "dow_cos",
            "dom_sin",
            "dom_cos",
            "weekend_flag",
            "month_start_flag",
            "month_end_flag",
        ]
        return df

    def _prepare_sequences(self, feature_frame: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        X, y = [], []
        feature_values = feature_frame[self.feature_columns].to_numpy(dtype=np.float32)
        target_values = feature_frame["target_scaled"].to_numpy(dtype=np.float32)

        for i in range(len(feature_frame) - self.window_size):
            X.append(feature_values[i : i + self.window_size])
            y.append(target_values[i + self.window_size])

        return np.array(X, dtype=np.float32), np.array(y, dtype=np.float32)

    def _compute_patterns(self, feature_frame: pd.DataFrame) -> Dict:
        recent = feature_frame.tail(min(180, len(feature_frame))).copy()
        non_sparse_recent = recent[recent["total_amount"] > 0]
        reference = non_sparse_recent if len(non_sparse_recent) >= 30 else recent

        overall_mean = float(reference["total_amount"].mean()) if not reference.empty else 0.0

        dow_means = (
            reference.groupby(reference["date"].dt.dayofweek)["total_amount"].mean().to_dict()
            if not reference.empty
            else {}
        )
        dom_means = (
            reference.groupby(reference["date"].dt.day)["total_amount"].mean().to_dict()
            if not reference.empty
            else {}
        )

        top_dom = sorted(dom_means.items(), key=lambda item: item[1], reverse=True)[:5]
        return {
            "overall_mean": overall_mean,
            "dow_means": {int(k): float(v) for k, v in dow_means.items()},
            "dom_means": {int(k): float(v) for k, v in dom_means.items()},
            "top_dom": [day for day, _ in top_dom],
        }

    def _select_seed_history(self, feature_frame: pd.DataFrame) -> pd.DataFrame:
        seed_length = max(self.window_size * 2, 60)
        tail = feature_frame.tail(self.window_size)
        recent_nonzero_ratio = float((tail["total_amount"] > 0).mean()) if not tail.empty else 0.0

        if recent_nonzero_ratio >= 0.15 or len(feature_frame) <= seed_length:
            active_tail = feature_frame[feature_frame["total_amount"] > 0]
            end_idx = int(active_tail.index[-1]) if not active_tail.empty else int(feature_frame.index[-1])
            start_idx = max(0, end_idx - seed_length + 1)
            seed = feature_frame.iloc[start_idx : end_idx + 1].copy()
            self.diagnostics["seed_strategy"] = "recent_tail"
        else:
            active_ratio = (feature_frame["total_amount"] > 0).rolling(self.window_size, min_periods=self.window_size).mean()
            dense_candidates = feature_frame[(active_ratio >= 0.15) & (feature_frame["total_amount"] > 0)]
            if dense_candidates.empty:
                active_tail = feature_frame[feature_frame["total_amount"] > 0]
                end_idx = int(active_tail.index[-1]) if not active_tail.empty else int(feature_frame.index[-1])
                start_idx = max(0, end_idx - seed_length + 1)
                seed = feature_frame.iloc[start_idx : end_idx + 1].copy()
                self.diagnostics["seed_strategy"] = "recent_tail_sparse_fallback"
            else:
                end_idx = int(dense_candidates.index[-1])
                start_idx = max(0, end_idx - seed_length + 1)
                seed = feature_frame.iloc[start_idx : end_idx + 1].copy()
                self.diagnostics["seed_strategy"] = "most_recent_dense_window"

        self.diagnostics["recent_nonzero_ratio"] = round(recent_nonzero_ratio, 3)
        return seed.reset_index(drop=True)

    def _expected_amount_for_date(self, future_date: pd.Timestamp, history: pd.DataFrame) -> float:
        recent = history.tail(30)
        recent_mean = float(recent["total_amount"].mean()) if not recent.empty else 0.0
        fallback_mean = self.patterns.get("overall_mean", recent_mean) or recent_mean
        base = recent_mean if recent_mean > 0 else fallback_mean

        dow_mean = self.patterns.get("dow_means", {}).get(int(future_date.dayofweek), base)
        dom_mean = self.patterns.get("dom_means", {}).get(int(future_date.day), dow_mean)

        expected = (0.45 * base) + (0.30 * dow_mean) + (0.25 * dom_mean)
        return max(expected, 0.0)

    def _blend_prediction(self, raw_pred: float, expected: float, history: pd.DataFrame) -> float:
        recent = history.tail(30)
        recent_mean = float(recent["total_amount"].mean()) if not recent.empty else expected
        recent_std = float(recent["total_amount"].std()) if len(recent) > 1 else max(expected * 0.15, 1.0)
        recent_nonzero_ratio = float((recent["total_amount"] > 0).mean()) if not recent.empty else 1.0

        if expected <= 0 and raw_pred <= 0:
            return 0.0

        if recent_nonzero_ratio < 0.15:
            blended = (0.20 * raw_pred) + (0.80 * expected)
        elif raw_pred < expected * 0.25:
            blended = (0.35 * raw_pred) + (0.65 * expected)
        else:
            blended = (0.65 * raw_pred) + (0.35 * expected)

        floor = max(expected * 0.35, recent_mean * 0.20, 0.0)
        ceiling = max(expected * 2.4, recent_mean + (2.5 * recent_std), floor + 1.0)
        return float(np.clip(blended, floor, ceiling))

    def train(self, daily_spending: pd.DataFrame, cache_key: str = "default") -> bool:
        try:
            if cache_key in _MODEL_CACHE:
                bundle = _MODEL_CACHE[cache_key]
                self.model = bundle["model"]
                self.feature_scaler = bundle["feature_scaler"]
                self.target_scaler = bundle["target_scaler"]
                self.feature_columns = bundle["feature_columns"]
                self.training_frame = bundle["training_frame"].copy()
                self.seed_history = bundle["seed_history"].copy()
                self.diagnostics = dict(bundle["diagnostics"])
                self.patterns = dict(bundle["patterns"])
                self.is_trained = True
                return True

            if len(daily_spending) < self.min_data_points:
                logger.warning("Insufficient data for LSTM: %s < %s", len(daily_spending), self.min_data_points)
                return False

            try:
                import tensorflow as tf
                from tensorflow import keras
                from sklearn.preprocessing import StandardScaler

                tf.get_logger().setLevel("ERROR")
            except ImportError:
                logger.error("TensorFlow not installed. Cannot use LSTM forecasting.")
                return False

            compressed = self._compress_inactive_gaps(daily_spending)
            feature_frame = self._build_feature_frame(compressed)

            if len(feature_frame) < self.min_data_points:
                logger.warning("Compressed training frame too small: %s", len(feature_frame))
                return False

            target_log = np.log1p(feature_frame["total_amount"].to_numpy(dtype=np.float32)).reshape(-1, 1)
            self.feature_scaler = StandardScaler()
            self.target_scaler = StandardScaler()

            scaled_features = self.feature_scaler.fit_transform(feature_frame[self.feature_columns])
            scaled_target = self.target_scaler.fit_transform(target_log).flatten()

            feature_frame = feature_frame.copy()
            feature_frame[self.feature_columns] = scaled_features
            feature_frame["target_scaled"] = scaled_target

            X, y = self._prepare_sequences(feature_frame)
            if len(X) < 30:
                logger.warning("Too few sequences for training: %s", len(X))
                return False

            model = keras.Sequential([
                keras.layers.Input(shape=(self.window_size, len(self.feature_columns))),
                keras.layers.LSTM(64, return_sequences=True),
                keras.layers.Dropout(0.15),
                keras.layers.LSTM(32),
                keras.layers.Dense(16, activation="relu"),
                keras.layers.Dense(1),
            ])
            model.compile(optimizer=keras.optimizers.Adam(learning_rate=0.001), loss="mse", metrics=["mae"])

            logger.info("Training multivariate LSTM on %s sequences", len(X))
            history = model.fit(
                X,
                y,
                epochs=35,
                batch_size=16,
                validation_split=0.2,
                verbose=0,
                callbacks=[
                    keras.callbacks.EarlyStopping(
                        monitor="val_loss",
                        patience=6,
                        restore_best_weights=True,
                    )
                ],
            )

            eval_count = min(45, max(10, len(X) // 6))
            eval_pred_scaled = model.predict(X[-eval_count:], verbose=0)
            eval_pred_log = self.target_scaler.inverse_transform(eval_pred_scaled).flatten()
            eval_true_log = self.target_scaler.inverse_transform(y[-eval_count:].reshape(-1, 1)).flatten()
            eval_pred = np.expm1(eval_pred_log)
            eval_true = np.expm1(eval_true_log)
            backtest_rmse = float(np.sqrt(np.mean((eval_pred - eval_true) ** 2))) if len(eval_true) else 0.0

            self.model = model
            self.training_frame = compressed.copy()
            self.seed_history = self._select_seed_history(compressed)
            self.patterns = self._compute_patterns(compressed)
            self.diagnostics = {
                "training_days": int(len(compressed)),
                "compressed_days": int(len(compressed)),
                "backtest_rmse": round(backtest_rmse, 2),
                "final_loss": round(float(history.history["loss"][-1]), 6),
            }
            self.is_trained = True

            _MODEL_CACHE[cache_key] = {
                "model": self.model,
                "feature_scaler": self.feature_scaler,
                "target_scaler": self.target_scaler,
                "feature_columns": list(self.feature_columns),
                "training_frame": self.training_frame.copy(),
                "seed_history": self.seed_history.copy(),
                "diagnostics": dict(self.diagnostics),
                "patterns": dict(self.patterns),
            }
            return True
        except Exception as exc:
            logger.error("LSTM training failed: %s", exc)
            return False

    def predict_recursive(self, last_date: pd.Timestamp, days_ahead: int = 30) -> np.ndarray:
        if not self.is_trained or self.model is None or self.seed_history is None:
            raise ValueError("Model not trained. Call train() first.")

        working_history = self.seed_history[["date", "total_amount"]].copy()
        working_history["date"] = pd.to_datetime(working_history["date"])
        predictions = []

        for step in range(days_ahead):
            feature_frame = self._build_feature_frame(working_history)
            window = feature_frame[self.feature_columns].tail(self.window_size).to_numpy(dtype=np.float32)
            if len(window) < self.window_size:
                raise ValueError("Not enough seed history for recursive forecast")

            pred_scaled = self.model.predict(window.reshape(1, self.window_size, len(self.feature_columns)), verbose=0)[0, 0]
            pred_log = self.target_scaler.inverse_transform(np.array([[pred_scaled]], dtype=np.float32))[0, 0]
            raw_pred = float(max(np.expm1(pred_log), 0.0))

            future_date = pd.to_datetime(last_date) + timedelta(days=step + 1)
            expected = self._expected_amount_for_date(future_date, working_history)
            final_pred = self._blend_prediction(raw_pred, expected, working_history)

            predictions.append(final_pred)
            working_history = pd.concat(
                [
                    working_history,
                    pd.DataFrame([{"date": future_date, "total_amount": final_pred}]),
                ],
                ignore_index=True,
            )

        return np.array(predictions, dtype=np.float32)

    def calculate_confidence(self, predictions: np.ndarray, reference_values: np.ndarray) -> float:
        mean_spend = float(np.mean(reference_values)) if len(reference_values) else 0.0
        rmse = float(self.diagnostics.get("backtest_rmse", 0.0))

        if mean_spend <= 0:
            return 0.5

        raw_confidence = 1.0 - (rmse / mean_spend)
        variability_penalty = min(float(np.std(predictions) / max(mean_spend, 1.0)), 1.0) * 0.15
        confidence = raw_confidence - variability_penalty
        return float(np.clip(confidence, 0.35, 0.95))

    def forecast(self, daily_spending: pd.DataFrame, days_ahead: int = 30, cache_key: str = "default") -> Dict:
        lstm_success = self.train(daily_spending, cache_key)

        if lstm_success and self.is_trained:
            try:
                return self._lstm_forecast(daily_spending, days_ahead)
            except Exception as exc:
                logger.error("LSTM forecast failed, falling back to statistical: %s", exc)
                return self._statistical_fallback(daily_spending, days_ahead)

        logger.info("Using statistical fallback for forecast")
        return self._statistical_fallback(daily_spending, days_ahead)

    def _lstm_forecast(self, daily_spending: pd.DataFrame, days_ahead: int) -> Dict:
        raw_series = daily_spending.copy()
        raw_series["date"] = pd.to_datetime(raw_series["date"])
        raw_series["total_amount"] = pd.to_numeric(raw_series["total_amount"], errors="coerce").fillna(0.0)
        raw_series = raw_series.sort_values("date").reset_index(drop=True)

        predictions = self.predict_recursive(raw_series["date"].iloc[-1], days_ahead)
        predictions = np.maximum(predictions, 0.0)

        active_reference = self.seed_history.tail(30)["total_amount"].to_numpy(dtype=np.float32)
        confidence = self.calculate_confidence(predictions, active_reference)
        slope, trend = self._calculate_trend(predictions)

        first_pred = float(predictions[0]) if len(predictions) else 0.0
        last_pred = float(predictions[-1]) if len(predictions) else 0.0
        trend_pct = float(((last_pred - first_pred) / first_pred) * 100) if first_pred > 0 else 0.0

        last_date = raw_series["date"].iloc[-1]
        forecast_points = []
        for i, pred in enumerate(predictions):
            fdate = last_date + timedelta(days=i + 1)
            forecast_points.append({
                "date": fdate.strftime("%Y-%m-%d"),
                "predicted_amount": round(float(pred), 2),
            })

        peak_idx = int(np.argmax(predictions)) if len(predictions) else 0
        recent_30 = self.seed_history.tail(30)["total_amount"]
        recent_7 = self.seed_history.tail(7)["total_amount"]

        return {
            "data": {
                "forecast": forecast_points,
                "total_predicted": round(float(np.sum(predictions)), 2),
                "trend": trend,
                "slope_per_day": round(float(slope), 2),
                "trend_pct": round(trend_pct, 1),
                "avg_daily_30d": round(float(recent_30.mean()), 2),
                "avg_daily_7d": round(float(recent_7.mean()), 2),
                "peak_day": {
                    "date": forecast_points[peak_idx]["date"] if forecast_points else None,
                    "predicted_amount": round(float(predictions[peak_idx]), 2) if len(predictions) else 0.0,
                },
                "seed_window": {
                    "start": self.seed_history["date"].iloc[0].strftime("%Y-%m-%d"),
                    "end": self.seed_history["date"].iloc[-1].strftime("%Y-%m-%d"),
                },
            },
            "metadata": {
                "method": "lstm_time_series",
                "method_label": "LSTM-based time series forecast",
                "is_ml_model": True,
                "training_days": int(len(self.training_frame)),
                "forecast_days": days_ahead,
                "confidence": round(confidence, 2),
                "window_size": self.window_size,
                "seed_strategy": self.diagnostics.get("seed_strategy", "recent_tail"),
                "recent_nonzero_ratio": self.diagnostics.get("recent_nonzero_ratio", 0.0),
                "backtest_rmse": self.diagnostics.get("backtest_rmse", 0.0),
            },
            "error": None,
        }

    def _statistical_fallback(self, daily_spending: pd.DataFrame, days_ahead: int) -> Dict:
        values = daily_spending["total_amount"].to_numpy(dtype=np.float32)
        recent_30 = values[-30:] if len(values) >= 30 else values
        recent_7 = values[-7:] if len(values) >= 7 else values

        avg_30 = float(np.mean(recent_30)) if len(recent_30) else 0.0
        avg_7 = float(np.mean(recent_7)) if len(recent_7) else 0.0
        std_30 = float(np.std(recent_30)) if len(recent_30) > 1 else 0.0

        if len(recent_30) >= 7:
            x = np.arange(len(recent_30), dtype=float)
            slope = float(np.polyfit(x, recent_30, 1)[0])
        else:
            slope = 0.0

        if slope > std_30 * 0.1:
            trend = "increasing"
        elif slope < -std_30 * 0.1:
            trend = "decreasing"
        else:
            trend = "stable"

        last_date = pd.to_datetime(daily_spending["date"].iloc[-1])
        forecast_points = []
        for i in range(1, days_ahead + 1):
            fdate = last_date + timedelta(days=i)
            predicted = max(0.0, avg_30 + (slope * i))
            forecast_points.append({
                "date": fdate.strftime("%Y-%m-%d"),
                "predicted_amount": round(predicted, 2),
            })

        peak_day = max(forecast_points, key=lambda item: item["predicted_amount"], default={"date": None, "predicted_amount": 0.0})
        first_pred = forecast_points[0]["predicted_amount"] if forecast_points else 0.0
        last_pred = forecast_points[-1]["predicted_amount"] if forecast_points else 0.0
        trend_pct = ((last_pred - first_pred) / first_pred * 100) if first_pred > 0 else 0.0

        return {
            "data": {
                "forecast": forecast_points,
                "total_predicted": round(sum(point["predicted_amount"] for point in forecast_points), 2),
                "trend": trend,
                "slope_per_day": round(slope, 2),
                "trend_pct": round(trend_pct, 1),
                "avg_daily_30d": round(avg_30, 2),
                "avg_daily_7d": round(avg_7, 2),
                "peak_day": peak_day,
                "seed_window": {
                    "start": pd.to_datetime(daily_spending["date"].iloc[max(0, len(daily_spending) - 30)]).strftime("%Y-%m-%d"),
                    "end": last_date.strftime("%Y-%m-%d"),
                },
            },
            "metadata": {
                "method": "linear_trend_moving_average",
                "method_label": "Statistical forecast (moving average + linear trend)",
                "is_ml_model": False,
                "training_days": len(daily_spending),
                "forecast_days": days_ahead,
                "confidence": round(min(0.65, 0.3 + len(recent_30) * 0.01), 2),
            },
            "error": None,
        }

    def _calculate_trend(self, predictions: np.ndarray) -> Tuple[float, str]:
        if len(predictions) < 7:
            return 0.0, "stable"

        x = np.arange(len(predictions), dtype=float)
        slope = float(np.polyfit(x, predictions, 1)[0])
        std = float(np.std(predictions))
        threshold = max(std * 0.03, 1.0)

        if slope > threshold:
            return slope, "increasing"
        if slope < -threshold:
            return slope, "decreasing"
        return slope, "stable"


def get_forecaster(window_size: int = 30, min_data_points: int = 60) -> LSTMForecaster:
    return LSTMForecaster(window_size=window_size, min_data_points=min_data_points)
