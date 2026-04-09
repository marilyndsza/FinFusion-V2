#!/usr/bin/env python3
"""
Backend API Testing for FinFusion Personal Finance App v2.0
Tests all API endpoints with new {data, metadata, error} response format.
Validates data-driven insights with no hardcoded text.
"""

import requests
import sys
import json
from datetime import datetime

class FinFusionAPITester:
    def __init__(self, base_url="http://localhost:8000"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details
        })

    def run_test(self, name, method, endpoint, expected_status=200, data=None, validate_response=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

            # Check status code
            if response.status_code != expected_status:
                self.log_test(name, False, f"Expected {expected_status}, got {response.status_code}")
                return False, {}

            # Parse JSON response
            try:
                response_data = response.json()
            except json.JSONDecodeError:
                self.log_test(name, False, "Invalid JSON response")
                return False, {}

            # Custom validation if provided
            if validate_response:
                validation_result = validate_response(response_data)
                if not validation_result[0]:
                    self.log_test(name, False, validation_result[1])
                    return False, response_data

            self.log_test(name, True)
            return True, response_data

        except requests.exceptions.RequestException as e:
            self.log_test(name, False, f"Request error: {str(e)}")
            return False, {}
        except Exception as e:
            self.log_test(name, False, f"Unexpected error: {str(e)}")
            return False, {}

    def validate_health_response(self, response):
        """Validate health endpoint response - new {data, metadata, error} format"""
        if not isinstance(response, dict):
            return False, "Response is not a dictionary"
        
        if 'data' not in response:
            return False, "Missing 'data' field in response"
        
        if 'metadata' not in response:
            return False, "Missing 'metadata' field in response"
        
        if 'error' not in response:
            return False, "Missing 'error' field in response"
        
        data = response['data']
        if not data.get('ok'):
            return False, "Health check failed - ok is not True"
        
        if not data.get('data_loaded'):
            return False, "Data not loaded - data_loaded is not True"
        
        return True, f"Health check passed - {data.get('expenses_count', 0)} expenses loaded"

    def validate_expenses_response(self, response):
        """Validate expenses endpoint response - new {data, metadata, error} format"""
        if not isinstance(response, dict):
            return False, "Response is not a dictionary"
        
        if 'data' not in response:
            return False, "Missing 'data' field in response"
        
        data = response['data']
        if not isinstance(data, list):
            return False, "Data is not a list"
        
        if len(data) == 0:
            return False, "No expenses found in response"
        
        # Check first expense structure
        expense = data[0]
        required_fields = ['id', 'amount', 'category', 'description', 'date']
        for field in required_fields:
            if field not in expense:
                return False, f"Missing required field: {field}"
        
        return True, f"Found {len(data)} expenses"

    def validate_analytics_response(self, response):
        """Validate analytics spending endpoint response - new format"""
        if not isinstance(response, dict):
            return False, "Response is not a dictionary"
        
        if 'data' not in response:
            return False, "Missing 'data' field in response"
        
        data = response['data']
        if 'total_monthly' not in data:
            return False, "Missing total_monthly field"
        
        if 'by_category' not in data:
            return False, "Missing by_category field"
        
        if not isinstance(data['by_category'], list):
            return False, "by_category is not a list"
        
        # Check for comparison data (month-over-month)
        comparison = data.get('comparison')
        if comparison:
            required_comparison_fields = ['previous_total', 'delta', 'delta_pct', 'direction']
            for field in required_comparison_fields:
                if field not in comparison:
                    return False, f"Missing comparison field: {field}"
        
        return True, f"Analytics data with total: {data['total_monthly']}, comparison: {comparison is not None}"

    def validate_suggestions_response(self, response):
        """Validate suggestions endpoint response - new format with data-driven insights"""
        if not isinstance(response, dict):
            return False, "Response is not a dictionary"
        
        if 'data' not in response:
            return False, "Missing 'data' field in response"
        
        data = response['data']
        if not isinstance(data, list):
            return False, "Data is not a list"
        
        # Check insight structure and validate no hardcoded text
        for i, insight in enumerate(data):
            required_fields = ['type', 'metric', 'message', 'value', 'confidence']
            for field in required_fields:
                if field not in insight:
                    return False, f"Insight {i} missing required field: {field}"
            
            # Validate insight types
            valid_types = ['month_comparison', 'top_category', 'spending_spike', 'trend', 'forecast', 'daily_spending', 'category_comparison', 'concentration']
            if insight['type'] not in valid_types:
                return False, f"Invalid insight type: {insight['type']}"
            
            # Check that message contains numeric values (no static text like "you saved 5%")
            message = insight['message']
            if not any(char.isdigit() for char in message):
                return False, f"Insight message lacks numeric values: {message}"
        
        return True, f"Found {len(data)} data-driven insights"

    def validate_forecast_response(self, response):
        """Validate forecast LSTM endpoint response - new format"""
        if not isinstance(response, dict):
            return False, "Response is not a dictionary"
        
        if 'data' not in response:
            return False, "Missing 'data' field in response"
        
        data = response['data']
        required_fields = ['forecast', 'total_predicted', 'trend', 'slope_per_day', 'avg_daily_30d']
        for field in required_fields:
            if field not in data:
                return False, f"Missing required field: {field}"
        
        if not isinstance(data['forecast'], list):
            return False, "forecast is not a list"
        
        # Check metadata for method labeling
        metadata = response.get('metadata', {})
        if 'method_label' not in metadata:
            return False, "Missing method_label in metadata"
        
        if 'is_ml_model' not in metadata:
            return False, "Missing is_ml_model in metadata"
        
        if 'confidence' not in metadata:
            return False, "Missing confidence in metadata"
        
        return True, f"Forecast with {len(data['forecast'])} points, trend: {data['trend']}, method: {metadata['method_label']}, ML: {metadata['is_ml_model']}"

    def validate_budget_response(self, response):
        """Validate smart budget endpoint response - new format"""
        if not isinstance(response, dict):
            return False, "Response is not a dictionary"
        
        if 'data' not in response:
            return False, "Missing 'data' field in response"
        
        data = response['data']
        required_fields = ['budget', 'total']
        for field in required_fields:
            if field not in data:
                return False, f"Missing required field: {field}"
        
        if not isinstance(data['budget'], list):
            return False, "budget is not a list"
        
        # Check budget item structure
        if len(data['budget']) > 0:
            budget_item = data['budget'][0]
            required_budget_fields = ['category', 'limit', 'current', 'percentage', 'hist_mean', 'hist_std', 'months_of_data']
            for field in required_budget_fields:
                if field not in budget_item:
                    return False, f"Missing budget field: {field}"
        
        # Check metadata for method labeling
        metadata = response.get('metadata', {})
        if 'method_label' not in metadata:
            return False, "Missing method_label in metadata"
        
        if 'is_ml_model' not in metadata:
            return False, "Missing is_ml_model in metadata"
        
        return True, f"Budget with {len(data['budget'])} categories, total: {data['total']}, method: {metadata['method_label']}"

    def validate_anomalies_response(self, response):
        """Validate anomalies endpoint response - new format"""
        if not isinstance(response, dict):
            return False, "Response is not a dictionary"
        
        if 'data' not in response:
            return False, "Missing 'data' field in response"
        
        data = response['data']
        required_fields = ['alerts', 'summary']
        for field in required_fields:
            if field not in data:
                return False, f"Missing required field: {field}"
        
        if not isinstance(data['alerts'], list):
            return False, "alerts is not a list"
        
        # Check alert structure
        if len(data['alerts']) > 0:
            alert = data['alerts'][0]
            required_alert_fields = ['amount', 'z_score', 'severity']
            for field in required_alert_fields:
                if field not in alert:
                    return False, f"Missing alert field: {field}"
        
        # Check metadata
        metadata = response.get('metadata', {})
        required_meta_fields = ['method', 'threshold', 'mean', 'std']
        for field in required_meta_fields:
            if field not in metadata:
                return False, f"Missing metadata field: {field}"
        
        return True, f"Anomaly detection with {len(data['alerts'])} alerts, method: {metadata['method']}"

    def test_create_expense(self):
        """Test creating a new expense"""
        test_expense = {
            "amount": 150.50,
            "category": "Food",
            "description": "Test expense from API test",
            "date": datetime.now().strftime("%Y-%m-%d")
        }
        
        def validate_create_response(data):
            if not isinstance(data, dict):
                return False, "Response is not a dictionary"
            
            required_fields = ['id', 'amount', 'category', 'description', 'date']
            for field in required_fields:
                if field not in data:
                    return False, f"Missing required field: {field}"
            
            if data['amount'] != test_expense['amount']:
                return False, f"Amount mismatch: expected {test_expense['amount']}, got {data['amount']}"
            
            return True, "Expense created successfully"
        
        return self.run_test(
            "Create Expense",
            "POST",
            "expenses",
            200,  # Backend returns 200 instead of 201
            test_expense,
            validate_create_response
        )

    def test_stable_expense_ids(self):
        """Test that expense IDs are stable across multiple GET calls"""
        # First call
        success1, response1 = self.run_test(
            "Get Expenses (First Call)",
            "GET",
            "expenses",
            200,
            validate_response=self.validate_expenses_response
        )
        
        if not success1:
            return False, {}
        
        # Second call
        success2, response2 = self.run_test(
            "Get Expenses (Second Call)",
            "GET", 
            "expenses",
            200,
            validate_response=self.validate_expenses_response
        )
        
        if not success2:
            return False, {}
        
        # Compare IDs
        ids1 = [exp['id'] for exp in response1.get('data', [])]
        ids2 = [exp['id'] for exp in response2.get('data', [])]
        
        if ids1 != ids2:
            self.log_test("Stable Expense IDs", False, f"IDs changed between calls: {len(ids1)} vs {len(ids2)} items")
            return False, {}
        
        self.log_test("Stable Expense IDs", True, f"IDs are stable across calls ({len(ids1)} expenses)")
        return True, response1

    def test_expenses_by_category(self, category):
        """Test getting expenses by category"""
        def validate_category_response(response):
            if not isinstance(response, dict):
                return False, "Response is not a dictionary"
            
            if 'data' not in response:
                return False, "Missing 'data' field in response"
            
            data = response['data']
            if not isinstance(data, list):
                return False, "Data is not a list"
            
            # Check that all expenses belong to the requested category
            for expense in data:
                if expense.get('category', '').lower() != category.lower():
                    return False, f"Found expense with wrong category: {expense.get('category')} (expected {category})"
            
            return True, f"Found {len(data)} expenses in {category} category"
        
        return self.run_test(
            f"Get {category} Expenses",
            "GET",
            f"expenses/category/{category}",
            200,
            validate_response=validate_category_response
        )

    def test_delete_expense_workflow(self):
        """Test complete delete workflow: create -> verify -> delete -> verify deletion"""
        # Step 1: Create a test expense
        test_expense = {
            "amount": 99.99,
            "category": "Transport",
            "description": "Test expense for deletion",
            "date": datetime.now().strftime("%Y-%m-%d")
        }
        
        success, created_expense = self.test_create_expense()
        if not success or not created_expense.get('id'):
            self.log_test("Delete Workflow - Create", False, "Failed to create test expense")
            return False
        
        expense_id = created_expense['id']
        
        # Step 2: Verify expense exists in list
        success, expenses_response = self.run_test(
            "Delete Workflow - Verify Creation",
            "GET",
            "expenses",
            200,
            validate_response=self.validate_expenses_response
        )
        
        if not success:
            return False
        
        expense_ids = [exp['id'] for exp in expenses_response.get('data', [])]
        if expense_id not in expense_ids:
            self.log_test("Delete Workflow - Verify Creation", False, f"Created expense {expense_id} not found in list")
            return False
        
        # Step 3: Delete the expense
        def validate_delete_response(response):
            if not isinstance(response, dict):
                return False, "Response is not a dictionary"
            
            if 'data' not in response:
                return False, "Missing 'data' field in response"
            
            data = response['data']
            if not data.get('deleted'):
                return False, "Delete operation not confirmed"
            
            if data.get('id') != expense_id:
                return False, f"Wrong expense ID in delete response: {data.get('id')} vs {expense_id}"
            
            return True, f"Expense {expense_id} deleted successfully"
        
        success = self.run_test(
            "Delete Workflow - Delete",
            "DELETE",
            f"expenses/{expense_id}",
            200,
            validate_response=validate_delete_response
        )
        
        if not success:
            return False
        
        # Step 4: Verify expense is removed from list
        success, final_expenses = self.run_test(
            "Delete Workflow - Verify Deletion",
            "GET",
            "expenses",
            200,
            validate_response=self.validate_expenses_response
        )
        
        if not success:
            return False
        
        final_expense_ids = [exp['id'] for exp in final_expenses.get('data', [])]
        if expense_id in final_expense_ids:
            self.log_test("Delete Workflow - Verify Deletion", False, f"Deleted expense {expense_id} still found in list")
            return False
        
        self.log_test("Delete Workflow - Complete", True, f"Expense {expense_id} successfully deleted and removed from list")
        return True

    def run_all_tests(self):
        """Run all API tests"""
        print("=" * 60)
        print("🧪 FinFusion API Testing Started")
        print("=" * 60)
        print(f"Testing backend at: {self.base_url}")
        print()

        # Test 1: Health Check
        self.run_test(
            "Health Check",
            "GET",
            "health",
            200,
            validate_response=self.validate_health_response
        )

        # Test 2: Get Expenses with Stable IDs
        self.test_stable_expense_ids()

        # Test 3: Analytics Spending
        self.run_test(
            "Analytics Spending",
            "GET",
            "analytics/spending",
            200,
            validate_response=self.validate_analytics_response
        )

        # Test 4: AI Suggestions
        self.run_test(
            "AI Suggestions",
            "GET",
            "suggestions",
            200,
            validate_response=self.validate_suggestions_response
        )

        # Test 5: Forecast LSTM
        self.run_test(
            "Forecast LSTM",
            "GET",
            "forecast/lstm",
            200,
            validate_response=self.validate_forecast_response
        )

        # Test 6: Smart Budget
        self.run_test(
            "Smart Budget",
            "GET",
            "budget/smart",
            200,
            validate_response=self.validate_budget_response
        )

        # Test 7: Anomaly Detection
        self.run_test(
            "Anomaly Detection",
            "GET",
            "expenses/anomalies",
            200,
            validate_response=self.validate_anomalies_response
        )

        # Test 8: Category-specific expenses
        self.test_expenses_by_category("Food")
        self.test_expenses_by_category("Rent")

        # Test 9: Complete delete workflow
        self.test_delete_expense_workflow()

        # Test 10: Create and verify expense appears in list
        success, created_expense = self.test_create_expense()
        if success and created_expense.get('id'):
            # Verify the created expense appears in the main list
            success, expenses_response = self.run_test(
                "Verify Created Expense in List",
                "GET",
                "expenses",
                200,
                validate_response=self.validate_expenses_response
            )
            
            if success:
                expense_ids = [exp['id'] for exp in expenses_response.get('data', [])]
                if created_expense['id'] in expense_ids:
                    self.log_test("Created Expense Appears in List", True, f"Expense {created_expense['id']} found in list")
                else:
                    self.log_test("Created Expense Appears in List", False, f"Expense {created_expense['id']} not found in list")

        # Print Results
        print()
        print("=" * 60)
        print("📊 Test Results Summary")
        print("=" * 60)
        print(f"Tests Run: {self.tests_run}")
        print(f"Tests Passed: {self.tests_passed}")
        print(f"Tests Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed / self.tests_run * 100):.1f}%")
        print()

        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed! Backend API is working correctly.")
            return 0
        else:
            print("⚠️  Some tests failed. Check the details above.")
            print()
            print("Failed Tests:")
            for result in self.test_results:
                if not result['success']:
                    print(f"  - {result['test']}: {result['details']}")
            return 1

def main():
    """Main test runner"""
    tester = FinFusionAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())
