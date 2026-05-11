const maliciousPattern = /[;<>&|`\\]/g;

function isMaliciousString(input) {
  if (typeof input !== 'string') return false;
  return maliciousPattern.test(input);
}

module.exports = {
  maliciousPattern,
  isMaliciousString
};
