"""Tests for app.nodes.input_validator."""

import pytest
from app.nodes.input_validator import validate_input, ValidationError, ValidationResult


# ── Diverse text corpus for generating valid input ──
_DIVERSE_SENTENCES = [
    "Trí tuệ nhân tạo đang thay đổi cách chúng ta làm việc hàng ngày.",
    "Python là ngôn ngữ lập trình phổ biến nhất thế giới hiện nay.",
    "Công nghệ blockchain mang lại sự minh bạch cho giao dịch tài chính.",
    "Machine Learning giúp máy tính học hỏi từ dữ liệu thực tế.",
    "React và TypeScript là bộ đôi phổ biến trong phát triển web.",
    "Điện toán đám mây cho phép mở rộng quy mô linh hoạt.",
    "Bảo mật thông tin là ưu tiên hàng đầu của mọi tổ chức.",
    "Docker giúp đóng gói ứng dụng một cách nhất quán.",
    "Kubernetes quản lý container trong môi trường sản xuất.",
    "API RESTful là tiêu chuẩn giao tiếp giữa các hệ thống.",
    "Dữ liệu lớn mở ra nhiều cơ hội kinh doanh mới.",
    "Thiết kế UX tốt giúp người dùng hài lòng hơn.",
    "Agile và Scrum là phương pháp quản lý dự án hiệu quả.",
    "DevOps kết hợp phát triển và vận hành phần mềm.",
    "Git là công cụ quản lý phiên bản không thể thiếu.",
    "Testing tự động giúp phát hiện lỗi sớm trong quy trình.",
    "Microservices chia hệ thống thành các dịch vụ nhỏ độc lập.",
    "GraphQL cung cấp truy vấn dữ liệu linh hoạt hơn REST.",
    "CI CD tự động hóa quy trình triển khai phần mềm.",
    "Kiến trúc serverless giảm chi phí vận hành máy chủ.",
    "Natural Language Processing xử lý ngôn ngữ tự nhiên.",
    "Computer Vision giúp máy tính hiểu hình ảnh và video.",
    "Edge Computing đưa xử lý dữ liệu gần nguồn phát sinh.",
    "IoT kết nối hàng tỉ thiết bị trên toàn thế giới.",
    "Quantum Computing hứa hẹn giải quyết bài toán phức tạp.",
    "Robotics kết hợp cơ khí, điện tử và phần mềm.",
    "Augmented Reality mở rộng thực tế qua màn hình số.",
    "Cybersecurity bảo vệ hệ thống khỏi tấn công mạng.",
    "Data Science khai phá giá trị từ lượng dữ liệu khổng lồ.",
    "Deep Learning tạo ra đột phá trong nhận dạng giọng nói.",
    "Bioinformatics ứng dụng tin học vào nghiên cứu sinh học.",
    "Digital Transformation thay đổi cách vận hành doanh nghiệp.",
    "Open Source thúc đẩy sự đổi mới và chia sẻ kiến thức.",
    "Sustainable Technology hướng tới phát triển bền vững.",
    "FinTech cách mạng hóa ngành dịch vụ tài chính.",
    "EdTech mang lại cơ hội giáo dục cho mọi người.",
    "HealthTech cải thiện chất lượng chăm sóc sức khỏe.",
    "GreenTech giảm tác động môi trường của công nghệ.",
    "SpaceTech mở ra kỷ nguyên khám phá vũ trụ mới.",
    "BioTech phát triển giải pháp y sinh tiên tiến.",
    "PropTech số hóa thị trường bất động sản truyền thống.",
    "InsurTech hiện đại hóa ngành bảo hiểm toàn cầu.",
    "LegalTech tự động hóa quy trình pháp lý phức tạp.",
    "AgriTech nâng cao năng suất nông nghiệp bền vững.",
    "RetailTech thay đổi trải nghiệm mua sắm hiện đại.",
]


def _make_text(word_count: int) -> str:
    """Generate diverse text with approximately `word_count` words."""
    words = []
    idx = 0
    while len(words) < word_count:
        sentence = _DIVERSE_SENTENCES[idx % len(_DIVERSE_SENTENCES)]
        words.extend(sentence.split())
        idx += 1
    return " ".join(words[:word_count])


class TestValidText:
    def test_valid_300_words(self):
        """300-word text should pass validation."""
        text = _make_text(300)
        result = validate_input(text)
        assert isinstance(result, ValidationResult)
        assert len(result.text.split()) >= 30
        assert len(result.text.split()) <= 500

    def test_valid_50_words(self):
        """50-word text (above minimum) should pass."""
        text = _make_text(50)
        result = validate_input(text)
        assert len(result.text.split()) >= 30

    def test_valid_returns_cleaned_text(self):
        """Result should contain the cleaned text."""
        text = _make_text(100)
        result = validate_input(text)
        assert result.text.strip() == result.text  # no leading/trailing whitespace


class TestTooShort:
    def test_10_words_rejected(self):
        """10-word text should be rejected as too short."""
        text = "Đây là câu ngắn chỉ có mười từ thôi."
        with pytest.raises(ValidationError) as exc_info:
            validate_input(text)
        assert exc_info.value.rule == "too_short"
        assert "too short" in str(exc_info.value).lower()

    def test_empty_text_rejected(self):
        """Empty text should be rejected."""
        with pytest.raises(ValidationError) as exc_info:
            validate_input("")
        assert exc_info.value.rule == "empty"

    def test_whitespace_only_rejected(self):
        """Whitespace-only text should be rejected."""
        with pytest.raises(ValidationError):
            validate_input("   \n\t  ")


class TestTooLong:
    def test_600_words_rejected(self):
        """600-word text should be rejected as too long."""
        text = _make_text(600)
        with pytest.raises(ValidationError) as exc_info:
            validate_input(text)
        assert exc_info.value.rule == "too_long"
        assert "too long" in str(exc_info.value).lower()


class TestSpamDetection:
    def test_three_identical_sentences_rejected(self):
        """3 consecutive identical sentences should be rejected as spam."""
        sentence = "Đây là câu lặp đi lặp lại trong văn bản này"
        filler = _make_text(40)
        text = f"{filler}. {sentence}. {sentence}. {sentence}."
        with pytest.raises(ValidationError) as exc_info:
            validate_input(text)
        assert exc_info.value.rule == "spam"

    def test_two_identical_not_spam(self):
        """2 consecutive identical sentences followed by different text should NOT be rejected."""
        sentence = "Đây là câu lặp lại trong bài viết"
        different = _make_text(40)
        text = f"{different}. {sentence}. {sentence}. {different}"
        # Should not raise spam error (only 2 consecutive, not 3)
        result = validate_input(text)
        assert isinstance(result, ValidationResult)


class TestEmojiRemoval:
    def test_emoji_auto_removed(self):
        """Emoji should be auto-removed with notification."""
        text = _make_text(50) + " 🚀🔥 thêm emoji vào đây"
        result = validate_input(text)
        assert "🚀" not in result.text
        assert "🔥" not in result.text
        assert len(result.warnings) > 0
        assert any("emoji" in w.lower() or "removed" in w.lower() for w in result.warnings)
        assert len(result.removed_chars) > 0

    def test_text_preserved_after_emoji_removal(self):
        """Text content should be preserved after emoji removal."""
        base = _make_text(50)
        text = base + " 😀 tiếp tục nội dung"
        result = validate_input(text)
        assert "tiếp tục" in result.text


class TestGibberish:
    def test_gibberish_warning(self):
        """5+ consecutive consonants should trigger warning."""
        text = _make_text(50) + " bcdfghjkl nội dung bình thường"
        result = validate_input(text)
        assert any("gibberish" in w.lower() for w in result.warnings)

    def test_normal_text_no_gibberish_warning(self):
        """Normal Vietnamese text should not trigger gibberish warning."""
        text = _make_text(100)
        result = validate_input(text)
        gibberish_warnings = [w for w in result.warnings if "gibberish" in w.lower()]
        assert len(gibberish_warnings) == 0
