(() => {
  const minimum = 10;
  const maximum = 128;
  const lengthMessage = 'Use 10–128 characters. A few memorable words work well.';

  window.TarotFlowerPasswordPolicy = Object.freeze({
    minimum,
    maximum,
    lengthMessage,
    error(value, confirmation) {
      const length = [...String(value || '').normalize('NFC')].length;
      if (length < minimum || length > maximum) return lengthMessage;
      if (value !== confirmation) return 'The two passwords do not match.';
      return '';
    },
  });
})();
