/**
 * Helpers for Redis value encoding.
 *
 * Stored format is a JSON string:
 *   {"type":"text","content":"hello","title":"Greeting"}
 */

/** Redis key prefix for every shared link. */
export const LINKS_PREFIX = 'surl:';

/** Preview truncation length in characters. */
export const PREVIEW_LENGTH = 15;

/** Compatibility marker returned by APIs when stored created data is missing or invalid. */
export const ILLEGAL_CREATED = 'illegal';

const RFC3339_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/;
const SHANGHAI_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;
const SHANGHAI_DATE_PATTERN = /^(\d{4})([-./])(\d{2})\2(\d{2})$/;
const SHANGHAI_OFFSET_MINUTES = 8 * 60;

function isLeapYear(year) {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
}

function getDaysInMonth(year, month) {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }

  if ([4, 6, 9, 11].includes(month)) {
    return 30;
  }

  return 31;
}

function isValidDateParts(year, month, day) {
  return month >= 1
    && month <= 12
    && day >= 1
    && day <= getDaysInMonth(year, month);
}

function isValidTimeParts(hour, minute, second) {
  return hour >= 0
    && hour <= 23
    && minute >= 0
    && minute <= 59
    && second >= 0
    && second <= 59;
}

function normalizeFractionToMilliseconds(fraction = '') {
  return Number.parseInt((fraction + '000').slice(0, 3), 10);
}

function formatUtcRfc3339(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function createUtcDateFromOffset({
  year,
  month,
  day,
  hour,
  minute,
  second,
  millisecond = 0,
  offsetMinutes,
}) {
  if (!isValidDateParts(year, month, day) || !isValidTimeParts(hour, minute, second)) {
    return null;
  }

  const utcTimestamp = Date.UTC(year, month - 1, day, hour, minute, second, millisecond)
    - (offsetMinutes * 60 * 1000);
  return new Date(utcTimestamp);
}

function parseRfc3339Created(input) {
  const match = RFC3339_PATTERN.exec(input);
  if (!match) {
    return null;
  }

  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    fractionText = '',
    zoneText,
    offsetSign,
    offsetHourText = '00',
    offsetMinuteText = '00',
  ] = match;
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);
  const hour = Number.parseInt(hourText, 10);
  const minute = Number.parseInt(minuteText, 10);
  const second = Number.parseInt(secondText, 10);
  const millisecond = normalizeFractionToMilliseconds(fractionText);

  let offsetMinutes = 0;
  if (zoneText !== 'Z') {
    const offsetHour = Number.parseInt(offsetHourText, 10);
    const offsetMinute = Number.parseInt(offsetMinuteText, 10);
    if (offsetHour > 23 || offsetMinute > 59) {
      return null;
    }

    const absoluteOffsetMinutes = (offsetHour * 60) + offsetMinute;
    offsetMinutes = offsetSign === '-' ? -absoluteOffsetMinutes : absoluteOffsetMinutes;
  }

  return createUtcDateFromOffset({
    year,
    month,
    day,
    hour,
    minute,
    second,
    millisecond,
    offsetMinutes,
  });
}

function parseShanghaiCreated(input) {
  const dateTimeMatch = SHANGHAI_DATETIME_PATTERN.exec(input);
  if (dateTimeMatch) {
    const [, yearText, monthText, dayText, hourText, minuteText, secondText] = dateTimeMatch;
    return createUtcDateFromOffset({
      year: Number.parseInt(yearText, 10),
      month: Number.parseInt(monthText, 10),
      day: Number.parseInt(dayText, 10),
      hour: Number.parseInt(hourText, 10),
      minute: Number.parseInt(minuteText, 10),
      second: Number.parseInt(secondText, 10),
      offsetMinutes: SHANGHAI_OFFSET_MINUTES,
    });
  }

  const dateMatch = SHANGHAI_DATE_PATTERN.exec(input);
  if (!dateMatch) {
    return null;
  }

  const [, yearText, , monthText, dayText] = dateMatch;
  return createUtcDateFromOffset({
    year: Number.parseInt(yearText, 10),
    month: Number.parseInt(monthText, 10),
    day: Number.parseInt(dayText, 10),
    hour: 0,
    minute: 0,
    second: 0,
    offsetMinutes: SHANGHAI_OFFSET_MINUTES,
  });
}

function parseCreatedDate(input) {
  if (typeof input !== 'string') {
    return null;
  }

  const trimmedInput = input.trim();
  if (!trimmedInput) {
    return null;
  }

  return parseRfc3339Created(trimmedInput) || parseShanghaiCreated(trimmedInput);
}

export function buildStoredValue({ type, content, title = '', created = '' }) {
  const storedValue = { type, content };
  if (title !== '') {
    storedValue.title = title;
  }
  if (created !== '') {
    storedValue.created = created;
  }
  return JSON.stringify(storedValue);
}

export function parseStoredValue(stored) {
  const parsedValue = JSON.parse(stored);
  return {
    type: typeof parsedValue.type === 'string' ? parsedValue.type : '',
    content: typeof parsedValue.content === 'string' ? parsedValue.content : '',
    title: typeof parsedValue.title === 'string' ? parsedValue.title : '',
    created: typeof parsedValue.created === 'string' ? parsedValue.created : '',
  };
}

export function normalizeCreatedInput(input) {
  const parsedDate = parseCreatedDate(input);
  if (!parsedDate) {
    throw new Error('`created` must be a valid RFC3339, RFC3339Nano, or Asia/Shanghai datetime');
  }

  return formatUtcRfc3339(parsedDate);
}

export function resolveStoredCreated(created) {
  const parsedDate = parseCreatedDate(created);
  if (!parsedDate) {
    return {
      created: ILLEGAL_CREATED,
      isValid: false,
      sortTimestamp: null,
    };
  }

  return {
    created: formatUtcRfc3339(parsedDate),
    isValid: true,
    sortTimestamp: Math.floor(parsedDate.getTime() / 1000),
  };
}

export function buildCurrentCreatedValue(currentTime = new Date()) {
  return formatUtcRfc3339(currentTime);
}

export function previewContent(type, content) {
  if (type === 'url' || type === 'file') return content;
  return content.length > PREVIEW_LENGTH
    ? content.substring(0, PREVIEW_LENGTH) + '...'
    : content;
}

export function getDomain(req) {
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers['host'];
  return `${protocol}://${host}`;
}

export function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += chunk.toString()));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}
