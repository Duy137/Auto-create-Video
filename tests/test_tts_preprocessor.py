"""Tests for app.nodes.tts_preprocessor."""

from app.nodes.tts_preprocessor import preprocess_for_tts


class TestNumberConversion:
    def test_simple_number(self):
        """100 → 'một trăm'."""
        result = preprocess_for_tts("Có 100 người tham gia")
        assert "100" not in result
        assert "một trăm" in result

    def test_large_number(self):
        """1000 → Vietnamese words."""
        result = preprocess_for_tts("Chi phí là 5000 đồng")
        assert "5000" not in result
        # num2words should produce Vietnamese

    def test_year_preserved(self):
        """Year numbers (2024, 2025) should NOT be converted."""
        result = preprocess_for_tts("Năm 2025 là năm quan trọng")
        assert "2025" in result

    def test_decimal_number(self):
        """Decimal numbers should be converted."""
        result = preprocess_for_tts("Tỉ lệ là 3.14 phần trăm")
        assert "3.14" not in result

    def test_number_in_identifier_preserved(self):
        """Numbers in identifiers like GPT-4 should be preserved."""
        result = preprocess_for_tts("Sử dụng GPT-4 để phân tích")
        assert "GPT-4" in result


class TestAbbreviations:
    def test_ai_preserved(self):
        """AI should be expanded to A.I. for TTS pronunciation."""
        result = preprocess_for_tts("AI là tương lai của công nghệ")
        assert "A.I." in result

    def test_api_preserved(self):
        """API should be expanded to A.P.I. for TTS pronunciation."""
        result = preprocess_for_tts("Gọi API để lấy dữ liệu")
        assert "A.P.I." in result

    def test_tphcm_expanded(self):
        """TPHCM → Thành phố Hồ Chí Minh."""
        result = preprocess_for_tts("TPHCM có thời tiết nóng")
        assert "Thành phố Hồ Chí Minh" in result

    def test_custom_expansion(self):
        """Custom abbreviation expansion should work."""
        result = preprocess_for_tts(
            "ML là lĩnh vực hot",
            custom_expansions={"ML": "Machine Learning"},
        )
        assert "Machine Learning" in result


class TestEdgeCases:
    def test_empty_string(self):
        """Empty string should return empty."""
        assert preprocess_for_tts("") == ""

    def test_no_changes_needed(self):
        """Text without numbers or abbreviations should pass through."""
        text = "Đây là đoạn văn bản bình thường không có gì đặc biệt"
        result = preprocess_for_tts(text)
        assert result == text

    def test_multiple_numbers(self):
        """Multiple numbers in one text."""
        result = preprocess_for_tts("Có 50 học sinh và 10 giáo viên")
        assert "50" not in result
        assert "10" not in result
