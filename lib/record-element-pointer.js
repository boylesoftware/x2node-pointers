'use strict';

const common = require('x2node-common');


/**
 * Record element pointer, which is an implementation of
 * [RFC 6901]{@link https://tools.ietf.org/html/rfc6901} JSON Pointer.
 *
 * @memberof module:x2node-pointers
 * @inner
 */
class RecordElementPointer {

	/**
	 * <strong>Note:</strong> The constructor is not accessible from the client
	 * code. Prointer instances are created using module's
	 * [parse()]{@link module:x2node-pointers.parse} function.
	 *
	 * @private
	 * @param {?module:x2node-pointers~RecordElementPointer} parent Parent
	 * pointer, or <code>null</code> for the root pointer.
	 * @param {?string} pointerToken Pointer token (no dash, no tilda escapes),
	 * or <code>null</code> if root pointer.
	 * @param {?module:x2node-records~PropertyDescriptor} propDesc Descriptor of
	 * the property, at which the pointer points, or <code>null</code> for the
	 * root pointer.
	 * @param {string} propPath Path to the property, at which the pointer
	 * points, or empty string for the root pointer.
	 * @param {boolean} collectionElement <code>true</code> if the pointer is for
	 * an array or map element.
	 * @param {(string|number)} [collectionElementIndex] If collection element
	 * pointer, this collection element index.
	 * @param {?module:x2node-records~PropertiesContainer} childrenContainer
	 * Child properties container, if applicable.
	 */
	constructor(
		parent, pointerToken, propDesc, propPath, collectionElement,
		collectionElementIndex, childrenContainer) {

		this._parent = parent;
		this._propDesc = propDesc;
		this._propPath = propPath;
		this._collectionElement = collectionElement;
		this._collectionElementIndex = collectionElementIndex;
		this._childrenContainer = childrenContainer;

		this._pointerString = (
			parent ?
				parent.toString() + '/' + pointerToken.replace(
						/[~\/]/g, m => (m === '~' ? '~0' : '~1')) :
				''
		);

		this._pointerChain = new Array();
		for (let p = this; p !== null; p = p._parent)
			this._pointerChain.push(p);
	}

	/**
	 * Parse the specified JSON pointer.
	 *
	 * @function module:x2node-pointers.parse
	 * @param {module:x2node-records~RecordTypeDescriptor} recordTypeDesc Record
	 * type descriptor.
	 * @param {string} propPointer Property pointer string in RFC 6901 format.
	 * @param {boolean} [noDash] <code>true</code> if a dash at the end of the
	 * pointer to an array element is not allowed.
	 * @returns {module:x2node-pointers~RecordElementPointer} Parsed record
	 * element pointer.
	 * @throws {module:x2node-common.X2SyntaxError} If the pointer is invalid.
	 */
	static parse(recordTypeDesc, propPointer, noDash) {

		// basic validation of the pointer
		if (((typeof propPointer) !== 'string') ||
			((propPointer.length > 0) && !propPointer.startsWith('/')))
			throw new common.X2SyntaxError(
				`Invalid record element pointer "${String(propPointer)}" type` +
					` or syntax.`);

		// parse the pointer
		const propPointerTokens = propPointer.split('/');
		let lastPointer = new RecordElementPointer(
			null, null, null, '', false, undefined, recordTypeDesc);
		for (let i = 1, len = propPointerTokens.length; i < len; i++) {
			lastPointer = lastPointer._createChildPointer(
				propPointerTokens[i].replace(
						/~[01]/g, m => (m === '~0' ? '~' : '/')),
				propPointer, noDash);
		}

		// return the pointer chain
		return lastPointer;
	}

	/**
	 * Create child pointer.
	 *
	 * @private
	 * @param {string} pointerToken Child pointer token.
	 * @param {string} fullPointer Full pointer for error reporting.
	 * @param {boolean} noDash <code>true</code> to disallow dash pointer.
	 * @returns {module:x2node-pointers~RecordElementPointer} Child property
	 * pointer.
	 * @throws {module:x2node-common.X2SyntaxError} If resulting pointer would be
	 * invalid.
	 */
	_createChildPointer(pointerToken, fullPointer, noDash) {

		// check if root
		const root = this.isRoot();

		// check if beyond dash
		if (!root && this._collectionElement && this._propDesc.isArray() &&
			(this._collectionElementIndex === '-'))
			throw new common.X2SyntaxError(
				`Invalid record element pointer "${fullPointer}":` +
					` unexpected dash for an array index.`);

		// check if array element
		if (!root && !this._collectionElement && this._propDesc.isArray()) {
			const dash = (pointerToken === '-');
			if (dash && noDash)
				throw new common.X2SyntaxError(
					`Invalid record element pointer "${fullPointer}":` +
						` dash not allowed for an array index in this pointer.`);
			if (!dash && !/^(?:0|[1-9][0-9]*)$/.test(pointerToken))
				throw new common.X2SyntaxError(
					`Invalid record element pointer "${fullPointer}":` +
						` invalid array index.`);
			return new RecordElementPointer(
				this, pointerToken, this._propDesc, this._propPath,
				true, (dash ? '-' : Number(pointerToken)),
				this._childrenContainer);
		}

		// check if map element
		if (!root && !this._collectionElement && this._propDesc.isMap())
			return new RecordElementPointer(
				this, pointerToken, this._propDesc, this._propPath,
				true, pointerToken,
				this._childrenContainer);

		// object property:

		// make sure it's a nested object or the record
		if (!root && (this._propDesc.scalarValueType !== 'object'))
			throw new common.X2SyntaxError(
				`Invalid record element pointer "${fullPointer}":` +
					` ${this._propDesc.container.nestedPath}` +
					`${this._propDesc.name} does not have nested elements.`);

		// check if polymorphic object's property
		if (this._childrenContainer.isPolymorphObject()) {

			// check if type property
			if (pointerToken === this._childrenContainer.typePropertyName)
				return new RecordElementPointer(
					this, pointerToken,
					this._childrenContainer.getPropertyDesc(pointerToken),
					this._childrenContainer.nestedPath + pointerToken,
					false, undefined, null);

			// check if polymorphic property
			const colonInd = pointerToken.indexOf(':');
			if ((colonInd > 0) && (colonInd < pointerToken.length - 1)) {
				const subtypeName = pointerToken.substring(0, colonInd);
				if (this._childrenContainer.hasProperty(subtypeName)) {
					const subtypePropDesc =
						this._childrenContainer.getPropertyDesc(subtypeName);
					const propName = pointerToken.substring(colonInd + 1);
					if (!subtypePropDesc.nestedProperties.hasProperty(propName))
						throw new common.X2SyntaxError(
							`Invalid record element pointer "${fullPointer}":` +
								` no such property.`);
					const childPropDesc =
						subtypePropDesc.nestedProperties.getPropertyDesc(
							propName);
					return new RecordElementPointer(
						this, pointerToken, childPropDesc,
						this._childrenContainer.nestedPath + subtypeName +
							'.' + propName,
						false, undefined,
						childPropDesc.nestedProperties);
				}
			}
		}

		// regular object property
		if (!this._childrenContainer.hasProperty(pointerToken))
			throw new common.X2SyntaxError(
				`Invalid record element pointer "${fullPointer}":` +
					` no such property.`);
		const childPropDesc = this._childrenContainer.getPropertyDesc(
			pointerToken);
		return new RecordElementPointer(
			this, pointerToken, childPropDesc,
			this._childrenContainer.nestedPath + pointerToken,
			false, undefined,
			childPropDesc.nestedProperties);
	}

	/**
	 * Create immediate child pointer of this pointer. This is faster than
	 * parsing the pointer from string notation as it does not have to re-parse
	 * the prefix.
	 *
	 * @param {string} pointerToken Token to append to the pointer to form the
	 * child pointer (without the leading slash).
	 * @returns {module:x2node-pointers~RecordElementPointer} Child pointer.
	 * @throws {module:x2node-common.X2UsageError} If resulting pointer would be
	 * invalid.
	 */
	createChildPointer(pointerToken) {

		return this._createChildPointer(
			pointerToken, this._pointerString + '/' + pointerToken, false);
	}

	/**
	 * Callback for the trace method.
	 *
	 * @callback module:x2node-pointers~RecordElementPointer~traceCallback
	 * @param {module:x2node-pointers~RecordElementPointer} prefixPtr The pointer
	 * representing the current pointer prefix. During a trace call, the callback
	 * is first called with the root pointer as the <code>prefixPtr</code> and
	 * last called with the actual pointer being traced (the leaf pointer).
	 * @param {*} value The in the record value at the current
	 * <code>prefixPtr</code>.
	 * @param {number} prefixDepth Current prefix depth. For the left pointer it
	 * is zero, one for the immediate parent pointer, and so on.
	 */

	/**
	 * Get value of the property, at which the pointer points.
	 *
	 * @param {Object} record The record, from which to get the value. Must match
	 * the pointer's record type.
	 * @param {module:x2node-pointers~RecordElementPointer~traceCallback} [traceFunc]
	 * Optional trace callback called for every prefix pointer starting from the
	 * root pointer and ending with this pointer.
	 * @returns {*} The property value, or <code>null</code> if no value. For
	 * absent array and map elements returns <code>undefined</code>.
	 * @throws {module:x2node-common.X2DataError} If the property cannot be
	 * reached.
	 */
	getValue(record, traceFunc) {

		if (traceFunc)
			return this._pointerChain.reduceRight((obj, p, i) => {
				const val = p._getImmediateValue(obj, i, false);
				traceFunc(p, val, i);
				return val;
			}, record);

		return this._pointerChain.reduceRight(
			(obj, p, i) => p._getImmediateValue(obj, i, false), record);
	}

	/**
	 * Add value to the property, at which the pointer points. If the pointer
	 * points at an array element, the value is inserted into the array at the
	 * specified by the pointer location. In all other cases, any existing value
	 * is simply replaced.
	 *
	 * <p>Note, that the method is not allowed on the root pointer.
	 *
	 * @param {Object} record The record.
	 * @param {*} value The value to add. May not be <code>undefined</code> (use
	 * [removeValue()]{@link module:x2node-pointers~RecordElementPointer#removeValue}
	 * method to delete optional property values). A <code>null</code> is not
	 * allowed for nested object array and map elements. <strong>The method does
	 * not validate the value in any other way beyond that.</strong>
	 * @returns {*} The previous value as if
	 * [getValue()]{@link module:x2node-pointers~RecordElementPointer#getValue}
	 * was called for the pointer before modifying the record.
	 * @throws {module:x2node-common.X2UsageError} If called on a root pointer,
	 * or inappropriate value is provided.
	 * @throws {module:x2node-common.X2DataError} If the property cannot be
	 * reached.
	 */
	addValue(record, value) {

		return this._setValue(record, value, true);
	}

	/**
	 * Replace value of the property, at which the pointer points.
	 *
	 * <p>Note, that the method is not allowed on the root pointer. Also, not
	 * allowed for a dash array element pointer.
	 *
	 * @param {Object} record The record.
	 * @param {*} value The value to set. May not be <code>undefined</code> (use
	 * [removeValue()]{@link module:x2node-pointers~RecordElementPointer#removeValue}
	 * method to delete optional property values). A <code>null</code> is not
	 * allowed for nested object array and map elements. <strong>The method does
	 * not validate the value in any other way beyond that.</strong>
	 * @returns {*} The previous value as if
	 * [getValue()]{@link module:x2node-pointers~RecordElementPointer#getValue}
	 * was called for the pointer before modifying the record.
	 * @throws {module:x2node-common.X2UsageError} If called on a root pointer,
	 * a dash array index pointer, or inappropriate value is provided.
	 * @throws {module:x2node-common.X2DataError} If the property cannot be
	 * reached.
	 */
	replaceValue(record, value) {

		return this._setValue(record, value, false);
	}

	/**
	 * Set value of the property, at which the pointer points.
	 *
	 * @private
	 * @param {Object} record The record.
	 * @param {*} value The value to set.
	 * @param {boolean} insert <code>true</code> to add value, <code>false</code>
	 * to replace.
	 * @returns {*} The previous value (as if <code>getValue()</code> called).
	 * @throws {module:x2node-common.X2UsageError} If called on a root pointer,
	 * a dash array index pointer and <code>insert</code> is <code>false</code>,
	 * or inappropriate value is provided.
	 * @throws {module:x2node-common.X2DataError} If the property cannot be
	 * reached.
	 */
	_setValue(record, value, insert) {

		if (this.isRoot())
			throw new common.X2UsageError('May not replace the whole record.');

		if (value === undefined)
			throw new common.X2UsageError('May not use undefined as a value.');

		if ((value === null) && this._collectionElement &&
			(this._propDesc.scalarValueType === 'object'))
			throw new common.X2UsageError('May not use null as a value.');

		return this._pointerChain.reduceRight((obj, p, i) => {
			const c = p._getImmediateValue(obj, i, true);
			if (i === 0) {
				if (p._collectionElement && p._propDesc.isArray()) {
					if (p._collectionElementIndex === '-') {
						if (!insert)
							throw new common.X2UsageError(
								'May not replace dash index.');
						obj.push(value);
					} else if (p._collectionElementIndex < obj.length) {
						if (insert)
							obj.splice(p._collectionElementIndex, 0, value);
						else
							obj[p._collectionElementIndex] = value;
					} else {
						throw new common.X2DataError(
							'Array index is out of bounds.');
					}
				} else if (p._collectionElement && p._propDesc.isMap()) {
					obj[p._collectionElementIndex] = value;
				} else {
					obj[p._propDesc.name] = value;
				}
			}
			return c;
		}, record);
	}

	/**
	 * Erase the property, at which the pointer points. If the pointer points at
	 * an array element, the element is deleted from the array.
	 *
	 * <p>Note, that the method is not allowed on the root pointer. Also, not
	 * allowed for a dash array element pointer.
	 *
	 * @param {Object} record The record.
	 * @returns {*} The previous value as if
	 * [getValue()]{@link module:x2node-pointers~RecordElementPointer#getValue}
	 * was called for the pointer before modifying the record.
	 * @throws {module:x2node-common.X2UsageError} If called on a root pointer,
	 * or a dash array index pointer.
	 * @throws {module:x2node-common.X2DataError} If the property cannot be
	 * reached.
	 */
	removeValue(record) {

		if (this.isRoot())
			throw new common.X2UsageError('May not delete the whole record.');

		return this._pointerChain.reduceRight((obj, p, i) => {
			const c = p._getImmediateValue(obj, i, false);
			if (i === 0) {
				if (p._collectionElement && p._propDesc.isArray()) {
					if (p._collectionElementIndex === '-') {
						throw new common.X2UsageError(
							'May not delete dash index.');
					} else if (obj && (p._collectionElementIndex < obj.length)) {
						obj.splice(p._collectionElementIndex, 1);
					} else {
						throw new common.X2DataError(
							'Array index is out of bounds.');
					}
				} else if (obj) {
					if (p._collectionElement && p._propDesc.isMap())
						delete obj[p._collectionElementIndex];
					else
						delete obj[p._propDesc.name];
				}
			}
			return c;
		}, record);
	}

	/**
	 * Get value of the property, at which the pointer points provided with the
	 * value of the parent property.
	 *
	 * @private
	 * @param {(Object|Array)} obj The parent object that is supposed to have the
	 * value.
	 * @param {number} i Index of the token in the pointer chain. Zero is for the
	 * last token.
	 * @param {boolean} forSet <code>true</code> if intended to set value at the
	 * pointer location (missing leaf arrays and maps are automatically created).
	 * @returns {*} The value.
	 * @throws {module:x2node-common.X2DataError} If the property cannot be
	 * reached.
	 */
	_getImmediateValue(obj, i, forSet) {

		const noValue = () => new common.X2DataError(
			`No property value at ${this._pointerString}.`);

		// return the record itself if root
		if (this.isRoot())
			return obj;

		// check if array index, map key or object property
		let val;
		if (this._propDesc.isArray() && this._collectionElement) {
			if (this._collectionElementIndex !== '-') {
				val = obj[this._collectionElementIndex];
				if (((val === undefined) || (val === null)) && (i > 0))
					throw noValue();
			}
		} else if (this._propDesc.isMap() && this._collectionElement) {
			val = obj[this._collectionElementIndex];
			if (((val === undefined) || (val === null)) && (i > 0))
				throw noValue();
		} else {
			val = obj[this._propDesc.name];
			if (val === undefined)
				val = null;
			if ((val === null) && (i > 0)) {
				if (i > 1)
					throw noValue();
				if (this._propDesc.isArray()) {
					val = new Array();
					if (forSet)
						obj[this._propDesc.name] = val;
				} else if (this._propDesc.isMap()) {
					val = new Object();
					if (forSet)
						obj[this._propDesc.name] = val;
				} else {
					throw noValue();
				}
			}
		}

		// return the value
		return val;
	}

	/**
	 * Tell if the pointer is the root pointer.
	 *
	 * @returns {boolean} <code>true</code> If root pointer.
	 */
	isRoot() { return (this._parent === null); }

	/**
	 * Tell if this pointer points to a child of the specified other pointer
	 * (that is the other pointer is a "proper prefix" of this pointer).
	 *
	 * @param {module:x2node-pointers~RecordElementPointer} otherPtr The other
	 * pointer.
	 * @returns {boolean} <code>true</code> if child.
	 */
	isChildOf(otherPtr) {

		return this._pointerString.startsWith(otherPtr.toString() + '/');
	}

	/**
	 * Descriptor of the property, at which the pointer points, or
	 * <code>null</code> if root pointer.
	 *
	 * @member {?module:x2node-records~PropertyDescriptor}
	 * @readonly
	 */
	get propDesc() { return this._propDesc; }

	/**
	 * Path of the property, at which the pointer points, or empty string if root
	 * pointer.
	 *
	 * @member {string}
	 * @readonly
	 */
	get propPath() { return this._propPath; }

	/**
	 * <code>true</code> if the pointer is for an array or map element.
	 *
	 * @member {boolean}
	 * @readonly
	 */
	get collectionElement() { return this._collectionElement; }

	/**
	 * For a collection element pointer (<code>collectionElement</code> is
	 * <code>true</code>), the element index, which, for an array element, is a
	 * number or a dash ("-") and for a map element&mdash;the map key string.
	 *
	 * @member {(number|string)=}
	 * @readonly
	 */
	get collectionElementIndex() { return this._collectionElementIndex; }

	/**
	 * Get string representation of the pointer in the RFC 6901 format.
	 *
	 * @returns {string} The pointer string (empty string for the root pointer).
	 */
	toString() { return this._pointerString; }
}

// export the class
module.exports = RecordElementPointer;
