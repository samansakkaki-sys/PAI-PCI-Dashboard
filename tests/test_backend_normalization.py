import importlib
import os
import sys
import unittest

from category_normalization import clean_category_text, normalize_category


os.environ.setdefault("HISTORY_API_URL", "https://example.com/history")

if "main" in sys.modules:
    del sys.modules["main"]

main = importlib.import_module("main")


class CategoryNormalizationTests(unittest.TestCase):
    def test_clean_category_text_normalizes_arabic_variants_and_whitespace(self):
        self.assertEqual(clean_category_text("  كالا   ي  ديجيتال  "), "کالا ی دیجیتال")

    def test_normalize_category_falls_back_to_cleaned_value(self):
        self.assertEqual(normalize_category("  دسته\u200cبندی  تست "), "دسته بندی تست")

    def test_filter_history_by_category_uses_normalized_category(self):
        rows = [
            main.attach_category_metadata({"category": "كالا  تست"}),
            main.attach_category_metadata({"category": "کالا تست"}),
        ]
        filtered = main.filter_history_by_category(rows, "  کالا تست ")
        self.assertEqual(len(filtered), 2)

    def test_serialize_history_row_keeps_raw_category_and_computes_totals(self):
        row = {
            "category": "کالا تست",
            "category_raw": "كالا تست",
            "date": "2026-04-17",
            "time": "12:30",
            "pai_retail_weighted": 0.2,
            "pai_bot_weighted": 0.6,
            "pai_seller_weighted": None,
            "pci_retail_weighted_avg": 0.1,
            "pci_bot_weighted_avg": 0.3,
            "pci_seller_weighted_avg": 0.2,
        }
        serialized = main.serialize_history_row(row, main.get_mode_fields("weighted"))
        self.assertEqual(serialized["category"], "کالا تست")
        self.assertEqual(serialized["category_raw"], "كالا تست")
        self.assertEqual(serialized["pai_total"], 0.6)
        self.assertAlmostEqual(serialized["pci_total"], 0.2)


if __name__ == "__main__":
    unittest.main()
