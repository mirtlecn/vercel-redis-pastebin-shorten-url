import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOPIC_CREATE_TYPE,
  buildCreatedValue,
  buildFileUploadData,
  buildInitialForm,
  buildTopicModeForm,
  buildRestoredForm,
  buildTextRequestBody,
  canSubmitComposerForm,
  formatTopicLabel,
  getComposerUiState,
  normalizeTopicNameValue,
} from '../web/src/lib/composer-mode.js';

test('normalizeTopicNameValue matches path rules, strips newlines, and rejects a leading slash', () => {
  assert.equal(normalizeTopicNameValue(' /anime/\ncastle? '), 'anime/castle');
  assert.equal(normalizeTopicNameValue('/'), '');
});

test('formatTopicLabel keeps a trailing slash while truncating long topic labels', () => {
  assert.equal(formatTopicLabel('anime'), 'anime/');
  assert.equal(formatTopicLabel('12345678901234567890'), '12345678901234…/');
});

test('buildTextRequestBody emits topic mutation payload for topic mode', () => {
  const form = {
    ...buildInitialForm('nested/topic'),
    convert: TOPIC_CREATE_TYPE,
    title: 'Anime Archive',
    createdDate: '2026-03-20',
    createdTime: '08:09',
    ttl: '1440',
    topic: 'nested/topic',
    path: 'ignored/path',
    url: '  anime/\ncastle  ',
  };

  assert.deepEqual(buildTextRequestBody(form), {
    path: 'anime/castle',
    type: TOPIC_CREATE_TYPE,
    title: 'Anime Archive',
    created: '2026-03-20 08:09:00',
  });
});

test('buildTextRequestBody keeps regular composer payload fields outside topic mode', () => {
  const form = {
    ...buildInitialForm('anime'),
    convert: 'qrcode',
    path: 'castle',
    title: 'Castle',
    createdDate: '2026-03-20',
    createdTime: '',
    topic: 'anime',
    ttl: '60',
    url: 'hello',
  };

  assert.deepEqual(buildTextRequestBody(form), {
    url: 'hello',
    path: 'castle',
    title: 'Castle',
    created: '2026-03-20',
    topic: 'anime',
    ttl: 60,
    convert: 'qrcode',
  });
});

test('buildTopicModeForm clears all fields and forces topic type', () => {
  assert.deepEqual(buildTopicModeForm(), {
    convert: TOPIC_CREATE_TYPE,
    path: '',
    title: '',
    createdDate: '',
    createdTime: '',
    topic: '',
    ttl: '',
    url: '',
  });
});

test('buildRestoredForm falls back to defaults for empty snapshot fields', () => {
  assert.deepEqual(
    buildRestoredForm({ convert: '', path: '', title: '', createdDate: '', createdTime: '', topic: '', ttl: '', url: '' }, 'selected/topic'),
    { convert: 'none', path: '', title: '', createdDate: '', createdTime: '', topic: '', ttl: '', url: '' },
  );
});

test('buildRestoredForm rebuilds a saved composer snapshot', () => {
  assert.deepEqual(
    buildRestoredForm({
      convert: 'md2html',
      path: 'castle',
      title: 'Castle',
      createdDate: '2026-03-20',
      createdTime: '08:09',
      topic: 'anime',
      ttl: '30',
      url: '# heading',
    }, 'selected/topic'),
    {
      convert: 'md2html',
      path: 'castle',
      title: 'Castle',
      createdDate: '2026-03-20',
      createdTime: '08:09',
      topic: 'anime',
      ttl: '30',
      url: '# heading',
    },
  );
});

test('canSubmitComposerForm requires a valid topic name in topic mode', () => {
  assert.equal(canSubmitComposerForm({
    busy: false,
    file: null,
    form: { ...buildInitialForm(''), convert: TOPIC_CREATE_TYPE, url: 'topic/name' },
  }), true);

  assert.equal(canSubmitComposerForm({
    busy: false,
    file: null,
    form: { ...buildInitialForm(''), convert: TOPIC_CREATE_TYPE, url: '???\n' },
  }), false);
});

test('canSubmitComposerForm supports normal text and file submits outside topic mode', () => {
  assert.equal(canSubmitComposerForm({
    busy: false,
    file: null,
    form: { ...buildInitialForm(''), convert: 'none', url: 'hello' },
  }), true);

  assert.equal(canSubmitComposerForm({
    busy: false,
    file: { name: 'demo.png' },
    form: { ...buildInitialForm(''), convert: 'none', url: '' },
  }), true);

  assert.equal(canSubmitComposerForm({
    busy: true,
    file: { name: 'demo.png' },
    form: { ...buildInitialForm(''), convert: 'none', url: '' },
  }), false);
});

test('getComposerUiState exposes topic mode UI constraints', () => {
  assert.deepEqual(
    getComposerUiState({
      form: { ...buildInitialForm('anime'), convert: TOPIC_CREATE_TYPE, title: 'Hidden title' },
      selectedTopic: { path: 'anime' },
      globalDragging: false,
      metaOpen: true,
    }),
    {
      editorPlaceholder: 'Input a valid topic name',
      pathInputVisible: false,
      pathPlaceholder: 'relative/path',
      showMetaToggle: true,
      metaVisible: true,
      topicPrefix: '/',
      ttlDisabled: true,
      ttlPlaceholder: 'never expires',
      ttlSuffixVisible: false,
    },
  );
});

test('getComposerUiState keeps normal editor affordances outside topic mode', () => {
  assert.deepEqual(
    getComposerUiState({
      form: { ...buildInitialForm(''), convert: 'none', title: 'Shown title' },
      selectedTopic: null,
      globalDragging: false,
      metaOpen: false,
    }),
    {
      editorPlaceholder: '',
      pathInputVisible: true,
      pathPlaceholder: 'custom/url/slug',
      showMetaToggle: true,
      metaVisible: true,
      topicPrefix: '/',
      ttlDisabled: false,
      ttlPlaceholder: 'never expires',
      ttlSuffixVisible: false,
    },
  );
});

test('getComposerUiState keeps meta visible when created is already filled', () => {
  assert.equal(
    getComposerUiState({
      form: { ...buildInitialForm(''), convert: 'none', createdDate: '2026-03-20' },
      selectedTopic: null,
      globalDragging: false,
      metaOpen: false,
    }).metaVisible,
    true,
  );
});

test('getComposerUiState still allows the title row to stay hidden after topic auto-open was dismissed', () => {
  assert.deepEqual(
    getComposerUiState({
      form: { ...buildInitialForm('anime'), convert: 'none', title: '' },
      selectedTopic: { path: 'anime' },
      globalDragging: false,
      metaOpen: false,
    }).metaVisible,
    false,
  );
});

test('getComposerUiState shows ttl suffix only when a numeric ttl is present', () => {
  assert.equal(
    getComposerUiState({
      form: { ...buildInitialForm(''), convert: 'none', ttl: '30' },
      selectedTopic: null,
      globalDragging: false,
      metaOpen: false,
    }).ttlSuffixVisible,
    true,
  );
});

test('buildCreatedValue returns null when no date is provided', () => {
  assert.equal(buildCreatedValue({ createdDate: '', createdTime: '08:09' }), null);
});

test('buildCreatedValue returns a date when time is omitted', () => {
  assert.equal(buildCreatedValue({ createdDate: '2026-03-20', createdTime: '' }), '2026-03-20');
});

test('buildCreatedValue appends seconds when date and time are both provided', () => {
  assert.equal(buildCreatedValue({ createdDate: '2026-03-20', createdTime: '08:09' }), '2026-03-20 08:09:00');
});

test('buildFileUploadData only appends created when a date exists', () => {
  const withCreated = buildFileUploadData({
    ...buildInitialForm('anime'),
    createdDate: '2026-03-20',
    createdTime: '08:09',
  }, new File(['demo'], 'demo.txt', { type: 'text/plain' }));
  const withoutCreated = buildFileUploadData({
    ...buildInitialForm('anime'),
    createdDate: '',
    createdTime: '08:09',
  }, new File(['demo'], 'demo.txt', { type: 'text/plain' }));

  assert.equal(withCreated.get('created'), '2026-03-20 08:09:00');
  assert.equal(withoutCreated.get('created'), null);
});
