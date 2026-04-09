import re
from datetime import datetime
from typing import Dict, Optional, List, Tuple
import os
import shutil
import pytesseract
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
import io


def configure_tesseract() -> None:
    """Point pytesseract at common macOS install locations when available."""
    if shutil.which("tesseract"):
        return

    common_paths = [
        "/opt/homebrew/bin/tesseract",
        "/usr/local/bin/tesseract",
    ]
    for path in common_paths:
        if os.path.exists(path):
            pytesseract.pytesseract.tesseract_cmd = path
            return

# ============================================================
# PREPROCESSING
# ============================================================

def preprocess_text(text: str) -> Tuple[List[str], str]:
    """
    Preprocess OCR text into normalized lines
    Returns: (cleaned_lines, normalized_text)
    """
    # Split into lines
    lines = text.split('\n')
    
    # Clean each line
    cleaned_lines = []
    for line in lines:
        # Strip whitespace
        line = line.strip()
        # Remove duplicate spaces
        line = re.sub(r'\s+', ' ', line)
        if line:  # Skip empty lines
            cleaned_lines.append(line)
    
    # Create normalized lowercase version for searching
    normalized_text = '\n'.join([line.lower() for line in cleaned_lines])
    
    return cleaned_lines, normalized_text

# ============================================================
# AMOUNT EXTRACTION (CORE LOGIC WITH HARD OVERRIDES)
# ============================================================

def extract_amount_with_scoring(lines: List[str], normalized_text: str) -> Tuple[Optional[float], float]:
    """
    Extract amount using hierarchical approach:
    1. Hard filter invalid candidates
    2. Total block override (MANDATORY)
    3. Scoring fallback (if override fails)
    4. Sanity check
    """
    
    print("\n[AMOUNT EXTRACTION]")
    print("-" * 60)
    
    # STEP 1: HARD FILTER - Collect all numeric candidates
    all_candidates = []
    item_prices = []  # Track item prices for sanity check
    
    for i, line in enumerate(lines):
        line_lower = line.lower()
        numbers = extract_numbers_from_line(line)
        
        for num in numbers:
            # HARD FILTER 1: Too small to be total
            if num < 50:
                print(f"[FILTER] Rejected {num} (< 50) from line {i}")
                continue
            
            # HARD FILTER 2: Less than 2 digits
            if num < 10:
                print(f"[FILTER] Rejected {num} (< 10) from line {i}")
                continue
            
            all_candidates.append({
                'value': num,
                'line_index': i,
                'line_text': line,
                'line_lower': line_lower
            })
            
            # Track potential item prices (for sanity check)
            if i < len(lines) * 0.6 and num < 5000:  # Upper section, reasonable price
                item_prices.append(num)
    
    # HARD FILTER 3: Remove frequently occurring values (OCR noise)
    value_counts = {}
    for c in all_candidates:
        value_counts[c['value']] = value_counts.get(c['value'], 0) + 1
    
    candidates = []
    for c in all_candidates:
        if value_counts[c['value']] > 3:  # Appears more than 3 times
            print(f"[FILTER] Rejected {c['value']} (appears {value_counts[c['value']]} times - likely noise)")
        else:
            candidates.append(c)
    
    # HARD FILTER 4: Remove numbers from item rows (multiple numbers in same line)
    filtered_candidates = []
    for c in candidates:
        line_numbers = extract_numbers_from_line(c['line_text'])
        if len(line_numbers) > 2:  # More than 2 numbers = likely item row
            print(f"[FILTER] Rejected {c['value']} from line {c['line_index']} (item row with {len(line_numbers)} numbers)")
        else:
            filtered_candidates.append(c)
    
    candidates = filtered_candidates
    
    print(f"[FILTER] {len(candidates)} candidates after filtering")
    
    # =================================================================
    # STEP 2: TOTAL BLOCK OVERRIDE (MANDATORY - SKIP SCORING)
    # =================================================================
    
    print("\n[OVERRIDE] Searching for explicit TOTAL lines...")
    
    total_keywords = [
        'grand total', 'net total', 'total amount', 'amount payable',
        'bill amount', 'final amount', 'total payable', 'amount due',
        'net amount', 'payable amount', 'final total', 'net payable'
    ]
    
    exclude_keywords = ['subtotal', 'sub total', 'cgst', 'sgst', 'igst', 'tax', 'gst']
    
    # Find all lines containing "total"
    total_lines = []
    for c in candidates:
        line_lower = c['line_lower']
        
        # Check if line contains any exclude keyword
        has_exclude = any(excl in line_lower for excl in exclude_keywords)
        if has_exclude:
            continue
        
        # Check if line contains "total"
        if 'total' in line_lower or 'amount' in line_lower or 'payable' in line_lower:
            # Check for strong total keywords
            keyword_match = None
            for keyword in total_keywords:
                if keyword in line_lower:
                    keyword_match = keyword
                    break
            
            if keyword_match or 'total' in line_lower:
                total_lines.append({
                    'candidate': c,
                    'keyword': keyword_match or 'total',
                    'priority': 2 if keyword_match else 1
                })
                print(f"[OVERRIDE] Found total line {c['line_index']}: {c['line_text']} (keyword: {keyword_match or 'total'})")
    
    # If we found total lines, pick the LOWEST one (closest to bottom)
    if total_lines:
        # Sort by line index (higher = closer to bottom)
        total_lines.sort(key=lambda x: x['candidate']['line_index'], reverse=True)
        
        selected = total_lines[0]['candidate']
        
        print(f"\n[OVERRIDE] ✓ SELECTED from total block (line {selected['line_index']})")
        print(f"[OVERRIDE] Amount: ₹{selected['value']}")
        print(f"[OVERRIDE] Context: {selected['line_text']}")
        print(f"[OVERRIDE] Reason: Lowest total line (closest to bottom)")
        
        # STEP 4: Sanity check
        confidence = 0.95  # High confidence for override
        
        # Check if amount is reasonable compared to item prices
        if item_prices:
            max_item = max(item_prices)
            if selected['value'] < max_item * 0.8:  # If significantly less than max item
                print(f"[SANITY] WARNING: Selected amount ({selected['value']}) much less than max item price ({max_item})")
                confidence = 0.7
        
        return selected['value'], confidence
    
    print("[OVERRIDE] No valid total lines found, falling back to scoring...")
    
    # =================================================================
    # STEP 3: FALLBACK - Scoring system (ONLY if override fails)
    # =================================================================
    
    print("\n[FALLBACK] Applying scoring system...")
    
    if not candidates:
        print("[FALLBACK] No candidates available")
        return None, 0.0
    
    # Score each candidate
    for c in candidates:
        score = 0
        line_lower = c['line_lower']
        value = c['value']
        
        # STRONG POSITIVE SIGNALS
        
        # +10: Currency symbol + large value (>500)
        if value > 500 and any(symbol in c['line_text'] for symbol in ['₹', 'rs.', 'rs ', 'inr']):
            score += 10
        
        # +8: Near bottom (last 30%)
        if c['line_index'] >= len(lines) * 0.7:
            score += 8
        
        # +5: Isolated number (only 1-2 numbers in line)
        line_numbers = extract_numbers_from_line(c['line_text'])
        if len(line_numbers) <= 2:
            score += 5
        
        # +3: Price-like format
        if '.' in str(value) or ',' in c['line_text']:
            score += 3
        
        # STRONG NEGATIVE SIGNALS
        
        # -10: Small values (<100)
        if value < 100:
            score -= 10
        
        # -10: Multiple numbers in same line (likely table)
        if len(line_numbers) > 2:
            score -= 10
        
        # -5: Contains tax keywords
        if any(keyword in line_lower for keyword in ['gst', 'cgst', 'sgst', 'tax']):
            score -= 5
        
        c['score'] = score
    
    # Sort by score
    candidates.sort(key=lambda x: (x['score'], x['line_index']), reverse=True)
    
    # Log all scored candidates
    print("\n[FALLBACK] Scored candidates:")
    for c in candidates[:5]:  # Top 5
        print(f"  {c['value']:>8} | score: {c['score']:>3} | line {c['line_index']}: {c['line_text'][:50]}")
    
    if not candidates:
        return None, 0.0
    
    best = candidates[0]
    
    # Calculate confidence
    confidence = min(1.0, max(0.3, (best['score'] + 15) / 30))
    
    # STEP 4: Sanity check
    if item_prices:
        max_item = max(item_prices)
        if best['value'] < max_item:
            print(f"[SANITY] WARNING: Selected amount ({best['value']}) < max item price ({max_item})")
            confidence = max(0.3, confidence - 0.3)
    
    print(f"\n[FALLBACK] Selected: ₹{best['value']} (score: {best['score']}, confidence: {confidence:.2f})")
    print(f"[FALLBACK] Context: {best['line_text']}")
    
    return best['value'], confidence

def extract_numbers_from_line(line: str) -> List[float]:
    """Extract all numeric values from a line"""
    cleaned_line = line.lower()
    cleaned_line = re.sub(r'(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})', ' ', cleaned_line)
    patterns = [r'(?:₹|rs\.?|inr)?\s*(\d[\d,]*\.?\d{0,2})']
    
    numbers = []
    for pattern in patterns:
        matches = re.findall(pattern, cleaned_line)
        for match in matches:
            try:
                num = float(match.replace(',', ''))
                numbers.append(num)
            except ValueError:
                continue
    
    return numbers

# ============================================================
# DATE EXTRACTION (ROBUST)
# ============================================================

def extract_date_with_scoring(lines: List[str]) -> Tuple[str, float]:
    """
    Extract date using scoring system
    Returns: (date_string, confidence)
    """
    candidates = []
    
    # Date patterns to search for
    date_patterns = [
        (r'(\d{2})[/-](\d{2})[/-](\d{4})', 'dd-mm-yyyy'),  # 25/12/2024
        (r'(\d{4})[/-](\d{2})[/-](\d{2})', 'yyyy-mm-dd'),  # 2024-12-25
        (r'(\d{2})[/-](\d{2})[/-](\d{2})', 'dd-mm-yy'),    # 25/12/24
    ]
    
    for i, line in enumerate(lines):
        line_lower = line.lower()
        
        for pattern, format_type in date_patterns:
            matches = re.finditer(pattern, line)
            for match in matches:
                score = 0
                
                # +2: Near top of receipt (first 30%)
                if i < len(lines) * 0.3:
                    score += 2
                
                # +2: Near "date" keyword
                if 'date' in line_lower or 'bill date' in line_lower:
                    score += 2
                
                # +1: Standard format
                if format_type in ['dd-mm-yyyy', 'yyyy-mm-dd']:
                    score += 1
                
                # Try to parse the date
                try:
                    groups = match.groups()
                    if format_type == 'yyyy-mm-dd':
                        date_obj = datetime.strptime(f"{groups[0]}-{groups[1]}-{groups[2]}", "%Y-%m-%d")
                    elif format_type == 'dd-mm-yyyy':
                        date_obj = datetime.strptime(f"{groups[0]}-{groups[1]}-{groups[2]}", "%d-%m-%Y")
                    else:  # dd-mm-yy
                        date_obj = datetime.strptime(f"{groups[0]}-{groups[1]}-{groups[2]}", "%d-%m-%y")
                    
                    # Validate date is reasonable (not in future, not too old)
                    if date_obj > datetime.now():
                        score -= 3
                    if date_obj.year < 2010:
                        score -= 2
                    
                    candidates.append({
                        'date': date_obj.strftime("%Y-%m-%d"),
                        'score': score,
                        'line_index': i,
                        'line_text': line
                    })
                except ValueError:
                    continue
    
    if candidates:
        # Pick best scored date
        candidates.sort(key=lambda x: (x['score'], -x['line_index']), reverse=True)
        best = candidates[0]
        confidence = min(1.0, max(0.3, (best['score'] + 3) / 8))
        
        print(f"[DATE] Selected: {best['date']} (score: {best['score']}, confidence: {confidence:.2f})")
        return best['date'], confidence
    
    # Fallback to today
    today = datetime.now().strftime("%Y-%m-%d")
    print(f"[DATE] No date found, using today: {today}")
    return today, 0.3

# ============================================================
# CATEGORY CLASSIFICATION (MULTI-SIGNAL)
# ============================================================

def classify_category(lines: List[str], normalized_text: str) -> Tuple[str, float]:
    """
    Classify category using weighted scoring
    Returns: (category, confidence)
    """
    scores = {
        'Food': 0,
        'Transport': 0,
        'Shopping': 0,
        'Entertainment': 0,
        'Healthcare': 0,
        'Utilities': 0,
        'Travel': 0,
        'Education': 0,
        'Rent': 0,
        'Other': 0
    }
    
    # FOOD signals
    food_keywords_strong = ['restaurant', 'cafe', 'hotel', 'dine', 'kitchen', 'bistro', 'eatery', 
                           'swiggy', 'zomato', 'uber eats', 'food delivery']
    food_keywords_medium = ['biryani', 'pizza', 'burger', 'chicken', 'naan', 'rice', 'pasta',
                           'coffee', 'tea', 'menu', 'table', 'waiter']
    
    for keyword in food_keywords_strong:
        if keyword in normalized_text:
            scores['Food'] += 3
    for keyword in food_keywords_medium:
        if keyword in normalized_text:
            scores['Food'] += 2
    
    # Additional food signals
    if 'qty' in normalized_text or 'item' in normalized_text:
        scores['Food'] += 2
    
    # TRANSPORT signals
    transport_keywords = ['uber', 'ola', 'lyft', 'taxi', 'cab', 'rapido', 'auto']
    fuel_keywords = ['petrol', 'diesel', 'fuel', 'gas', 'pump', 'hp', 'bharat petroleum']
    
    for keyword in transport_keywords:
        if keyword in normalized_text:
            scores['Transport'] += 3
    for keyword in fuel_keywords:
        if keyword in normalized_text:
            scores['Transport'] += 3
    
    # SHOPPING signals
    shopping_keywords = ['mall', 'store', 'retail', 'mart', 'supermarket', 'shopping',
                        'amazon', 'flipkart', 'myntra', 'fashion', 'clothing', 'phoenix',
                        'market', 'shop', 'apparel']
    
    for keyword in shopping_keywords:
        if keyword in normalized_text:
            scores['Shopping'] += 3
    
    # ENTERTAINMENT signals
    entertainment_keywords = ['movie', 'cinema', 'theatre', 'pvr', 'inox', 'ticket',
                             'show', 'concert', 'event']
    
    for keyword in entertainment_keywords:
        if keyword in normalized_text:
            scores['Entertainment'] += 3
    
    # HEALTHCARE signals
    healthcare_keywords = ['hospital', 'clinic', 'pharmacy', 'medical', 'doctor', 'medicine',
                          'apollo', 'health', 'diagnostic']
    
    for keyword in healthcare_keywords:
        if keyword in normalized_text:
            scores['Healthcare'] += 3
    
    # UTILITIES signals
    utilities_keywords = ['electricity', 'water', 'gas', 'internet', 'broadband', 'mobile',
                         'recharge', 'bill', 'jio', 'airtel', 'vodafone']
    
    for keyword in utilities_keywords:
        if keyword in normalized_text:
            scores['Utilities'] += 3

    rent_keywords = ['rent', 'lease', 'landlord', 'maintenance', 'deposit', 'apartment', 'flat']
    for keyword in rent_keywords:
        if keyword in normalized_text:
            scores['Rent'] += 3
    
    # TRAVEL signals
    travel_keywords = ['hotel', 'resort', 'booking', 'flight', 'airline', 'airport',
                      'accommodation', 'airbnb', 'oyo', 'makemytrip']
    
    for keyword in travel_keywords:
        if keyword in normalized_text:
            scores['Travel'] += 3
    
    # EDUCATION signals
    education_keywords = ['school', 'college', 'university', 'course', 'tuition',
                         'book', 'stationery', 'exam', 'fees']
    
    for keyword in education_keywords:
        if keyword in normalized_text:
            scores['Education'] += 3
    
    # Find category with highest score
    max_score = max(scores.values())
    
    if max_score == 0:
        print(f"[CATEGORY] No strong signals, defaulting to 'Other'")
        return 'Other', 0.3
    
    best_category = max(scores, key=scores.get)
    confidence = min(1.0, max(0.3, max_score / 10))
    
    print(f"[CATEGORY] Selected: {best_category} (score: {max_score}, confidence: {confidence:.2f})")
    
    return best_category, confidence

# ============================================================
# DESCRIPTION EXTRACTION
# ============================================================

def extract_description(lines: List[str]) -> Tuple[str, float]:
    """
    Extract merchant/store name from top section
    Returns: (description, confidence)
    """
    # Look at first 5 lines
    top_lines = lines[:5]
    
    candidates = []
    
    for i, line in enumerate(top_lines):
        score = 0
        line_lower = line.lower()
        
        # Skip if line is too short
        if len(line) < 3:
            continue
        
        # Skip if line is just numbers/dates
        if re.match(r'^[\d\s\-\/\:\.\,]+$', line):
            continue
        
        # Skip if line contains address indicators
        if any(keyword in line_lower for keyword in ['address', 'pin', 'gst', 'gstin', 'phone', 'mob']):
            score -= 3
        
        # Skip if line is very number-heavy
        num_digits = sum(c.isdigit() for c in line)
        if num_digits > len(line) * 0.5:
            score -= 2
        
        # Positive signals
        # +3: First non-empty line
        if i == 0:
            score += 3
        
        # +2: Contains capital letters (merchant names often capitalized)
        if any(c.isupper() for c in line):
            score += 2
        
        # +1: Reasonable length (5-50 chars)
        if 5 <= len(line) <= 50:
            score += 1
        
        candidates.append({
            'text': line.strip(),
            'score': score,
            'line_index': i
        })
    
    if candidates:
        # Sort by score
        candidates.sort(key=lambda x: (x['score'], -x['line_index']), reverse=True)
        best = candidates[0]
        
        # Truncate if too long
        description = best['text'][:100]
        
        confidence = min(1.0, max(0.4, (best['score'] + 5) / 10))
        
        print(f"[DESCRIPTION] Selected: '{description}' (score: {best['score']}, confidence: {confidence:.2f})")
        
        return description, confidence
    
    # Fallback
    print(f"[DESCRIPTION] No suitable description found, using fallback")
    return "Receipt scan", 0.3


def extract_line_item_description(lines: List[str]) -> Optional[str]:
    """
    Pick the most likely line item / purchase description from the middle of the receipt.
    """
    item_candidates = []
    skip_keywords = [
        'total', 'subtotal', 'tax', 'gst', 'cgst', 'sgst', 'invoice', 'receipt',
        'bill no', 'date', 'amount', 'cash', 'card', 'upi', 'thank you'
    ]

    for i, line in enumerate(lines[1:12], start=1):
        line_lower = line.lower()

        if any(keyword in line_lower for keyword in skip_keywords):
            continue
        if len(line.strip()) < 3:
            continue

        numbers = extract_numbers_from_line(line)
        letters = sum(char.isalpha() for char in line)
        if letters < 3:
            continue

        score = 0
        if numbers:
            score += 3
        if 4 <= len(line) <= 40:
            score += 2
        if i <= 6:
            score += 1

        item_candidates.append({
            'text': re.sub(r'\s+\d[\d,]*\.?\d*.*$', '', line).strip(' -:'),
            'score': score,
        })

    if not item_candidates:
        return None

    item_candidates.sort(key=lambda item: item['score'], reverse=True)
    return item_candidates[0]['text'] or None

# ============================================================
# MAIN PARSER
# ============================================================

def parse_receipt(text: str) -> Dict:
    """
    Main receipt parsing function with confidence scoring
    """
    print("\n" + "=" * 70)
    print("RECEIPT PARSING")
    print("=" * 70)
    
    # Preprocess
    lines, normalized_text = preprocess_text(text)
    
    print(f"Preprocessed: {len(lines)} lines")
    print("-" * 70)
    
    # Extract fields with confidence
    amount, amount_conf = extract_amount_with_scoring(lines, normalized_text)
    date, date_conf = extract_date_with_scoring(lines)
    category, category_conf = classify_category(lines, normalized_text)
    description, desc_conf = extract_description(lines)
    item_description = extract_line_item_description(lines)

    final_description = item_description or description
    
    # Calculate overall confidence
    overall_confidence = (amount_conf + date_conf + category_conf + desc_conf) / 4
    
    print("-" * 70)
    print(f"OVERALL CONFIDENCE: {overall_confidence:.2f}")
    print("=" * 70 + "\n")
    
    return {
        'amount': amount,
        'date': date,
        'category': category,
        'description': final_description,
        'merchant': description,
        'raw_text_preview': '\n'.join(lines[:12]),
        'confidence': round(overall_confidence, 2)
    }

# ============================================================
# OCR INTEGRATION
# ============================================================

def preprocess_image(image_bytes: bytes) -> Image:
    """Basic image preprocessing for better OCR"""
    image = Image.open(io.BytesIO(image_bytes))
    
    if image.mode != 'RGB':
        image = image.convert('RGB')

    image = ImageOps.exif_transpose(image)
    width, height = image.size
    if width < 1400:
        scale = 1400 / max(width, 1)
        image = image.resize((int(width * scale), int(height * scale)))

    image = image.convert('L')
    image = ImageOps.autocontrast(image)
    image = ImageEnhance.Contrast(image).enhance(1.8)
    image = image.filter(ImageFilter.SHARPEN)
    image = image.point(lambda px: 255 if px > 165 else 0)
    return image

def extract_text(image: Image) -> str:
    """Extract text from image using pytesseract"""
    try:
        text = pytesseract.image_to_string(image, config='--oem 3 --psm 6')
        return text
    except Exception as e:
        raise Exception(f"OCR failed: {str(e)}")

def scan_receipt(image_bytes: bytes) -> Dict:
    """Main function to scan receipt and extract data"""
    try:
        configure_tesseract()

        # Preprocess image
        image = preprocess_image(image_bytes)
        
        # Extract text
        text = extract_text(image)
        
        if not text or len(text.strip()) < 10:
            return {
                "success": False,
                "error": "Could not extract text from image"
            }
        
        # Parse receipt
        parsed = parse_receipt(text)
        
        if not parsed['amount']:
            return {
                "success": False,
                "error": "Could not extract amount from receipt"
            }
        
        return {
            "success": True,
            "extracted": {
                "amount": parsed['amount'],
                "date": parsed['date'],
                "category": parsed['category'],
                "description": parsed['description'],
                "merchant": parsed.get('merchant'),
            },
            "confidence": parsed['confidence'],
            "raw_text_preview": parsed.get('raw_text_preview', ''),
        }
    
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }
