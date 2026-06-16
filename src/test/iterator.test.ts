import {test, assert} from 'vitest';

import {count_iterator} from '$lib/iterator.ts';

test('count_iterator', () => {
	assert.strictEqual(count_iterator('test'), 4);
	assert.strictEqual(count_iterator([1, '2', false]), 3);
	assert.strictEqual(count_iterator(new Intl.Segmenter().segment('abcde')), 5);
});
