/**
 * Checks if the given element is editable.
 * Returns `true` for text-based input types, textareas, and contenteditable elements.
 */
export const is_editable = (el: any): boolean => {
	if (!el) return false;
	const {tagName} = el;
	return (
		(tagName === 'INPUT' && el.type !== 'hidden') ||
		tagName === 'TEXTAREA' ||
		el.contentEditable === 'true' ||
		el.contentEditable === '' // Some browsers treat empty string as `'true'`
	);
};

/**
 * Returns `true` if the element is within a `contenteditable` ancestor.
 */
export const inside_editable = (el: Element): boolean => {
	const found = el.closest('[contenteditable]');
	return found !== null && (found as any).contentEditable !== 'false';
};

/**
 * Checks if the element is interactive (clickable, focusable, or otherwise accepts user input).
 * Returns `true` for buttons, links, form controls,
 * and elements with interactive attributes and ARIA roles.
 */
export const is_interactive = (el: any): boolean => {
	if (!el) return false;

	const {tagName} = el;
	if (
		tagName === 'BUTTON' ||
		tagName === 'SELECT' ||
		tagName === 'TEXTAREA' ||
		tagName === 'A' ||
		tagName === 'AUDIO' ||
		tagName === 'VIDEO' ||
		(tagName === 'INPUT' && el.type !== 'hidden')
	) {
		return true;
	}

	const role = el.getAttribute?.('role');
	return (
		(role &&
			(role === 'button' ||
				role === 'link' ||
				role === 'menuitem' ||
				role === 'option' ||
				role === 'switch' ||
				role === 'tab')) ||
		(el.hasAttribute?.('tabindex') && el.getAttribute('tabindex') !== '-1') ||
		el.contentEditable === 'true' ||
		el.contentEditable === '' ||
		el.getAttribute?.('draggable') === 'true'
	);
};

/**
 * Stops an event from bubbling and doing default behavior.
 * @param event
 * @param immediate defaults to `true` to use `stopImmediatePropagation` over `stopPropagation`
 * @param preventDefault defaults to `true`
 * @mutates event - calls preventDefault(), stopPropagation(), or stopImmediatePropagation()
 * @returns
 */
export const swallow = <
	T extends Pick<Event, 'preventDefault' | 'stopPropagation' | 'stopImmediatePropagation'>,
>(
	event: T,
	immediate = true,
	preventDefault = true,
): T => {
	if (preventDefault) event.preventDefault();
	if (immediate) {
		event.stopImmediatePropagation();
	} else {
		event.stopPropagation();
	}
	return event;
};

// TODO improve these types, the motivation was the strictness of Svelte DOM types
/**
 * Handles the value of an event's target and invokes a callback.
 * Defaults to swallowing the event to prevent default actions and propagation.
 * @mutates event - calls `swallow()` which mutates the event if `swallow_event` is true
 */
export const handle_target_value =
	(cb: (value: any, event: any) => void, swallow_event = true) =>
	(e: any): void => {
		if (swallow_event) swallow(e);
		cb(e.target.value, e);
	};

/**
 * Returns a boolean indicating if the current browser window, if any, is iframed inside of another.
 */
export const is_iframed = (): boolean => {
	if (typeof window === 'undefined') return false;
	try {
		return window.self !== window.top; // some browsers may throw here due to the same origin policy
	} catch (_err) {
		return false;
	}
};
