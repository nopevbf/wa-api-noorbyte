function parseDparagonTime(rawTime) {
  if (!rawTime || rawTime === "-" || typeof rawTime !== 'string') return 0;

  let rawStr = rawTime
    .replace(/\(WIB\)/gi, "")
    .trim();

  if (rawStr === "") return 0;

  const timeMatch = rawStr.match(/(\d{1,2}:\d{2}(:\d{2})?)/);
  let timePart = "00:00:00";
  if (timeMatch) {
    timePart = timeMatch[0];
  }

  let datePart = rawStr
    .replace(timePart, "")
    .replace(/^[a-zA-Z]+,\s+/i, "")
    .trim();

  datePart = datePart
    .replace(/[\n\r]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  // If there's no date part after removing time, it's unparseable or just time.
  if (!datePart) return 0;

  const bulanId = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  const bulanEn = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  bulanId.forEach((id, index) => {
    datePart = datePart.replace(new RegExp(id, "gi"), bulanEn[index]);
  });

  const finalDateTimeStr = `${datePart} ${timePart}`;
  const parsedDate = new Date(finalDateTimeStr).getTime();

  return isNaN(parsedDate) ? 0 : parsedDate;
}

module.exports = { parseDparagonTime };
