# X2 Framework for Node.js | JSON Pointers

This module is an implementation of _JSON Pointer_ ([RFC 6901](https://tools.ietf.org/html/rfc6901)) for use with the record objects as defined by the X2 Framework's [x2node-records](https://www.npmjs.com/package/x2node-records) module. The module constructs pointer objects, which, given a record of a certain record type, allow reading values of the record elements (such as record properties and collection property elements) as well as performing basic record modification operations including "add", "replace" and "remove".

## Usage

A JSON pointer against a record type can be parsed into a `RecordElementPointer` class object using module's `parse()` function:

```javascript
const records = require('x2node-records');
const pointers = require('x2node-pointers');

const recordTypes = records.buildLibrary({
	recordTypes: {
		'Order': {
			...
		},
		...
	}
});

const ptr = pointers.parse(
	recordTypes.getRecordTypeDesc('Order'), '/items/0/quantity');
```

The `parse()` function takes the following arguments:

* `recordTypeDesc` - `RecordTypeDescriptor` for the record type, against which the pointer is going to be used.

* `propPointer` - The pointer string.

* `noDash` (optional) - `true` to disallow dash at the end of an array element pointer. Such dash pointer is allowed only in certain contexts (such as _JSON Patch_ "add" operation, for example), so this flag allows disallowing it at the pointer parse step.

The returned `RecordElementPointer` object exposes the following properties and methods:

* `isRoot()` - Returns `true` if the pointer is a root pointer. A root pointer corresponds to an empty string and points to the record as a whole.

* `isChildOf(otherPtr)` - Returns `true` if the pointer points to a child location of the specified other pointer (that is the other pointer is a "proper prefix" of this pointer). For example, will always return `true` if the other pointer is a root pointer and this one is not.

* `propDesc` - `PropertyDescriptor` of the property, at which the pointer points. For an array or map element pointer, the property descriptor of the array or map property but the pointer object's `collectionElement` flag is set to indicate that it is for an element and not the whole array or map property. For the root pointer this property is `null`.

* `propPath` - Property path corresponding to `propDesc`, or `null` for the root pointer.

* `collectionElement` - `true` if the pointer is for an array or map property element.

* `collectionElementIndex` - For a collection element pointer (`collectionElement` is `true`), the element index, which, for an array element, is a number or a dash ("-") and for a map element&mdash;the map key string.

* `createChildPointer(pointerToken)` - Creates and returns immediate child pointer of this pointer. This is faster than parsing the pointer from string notation as it does not have to re-parse the prefix.

* `getValue(record, [traceFunc])` - Given a record, gets value of the property, at which the pointer points. Returns `null` if no value. For absent array and map elements returns `undefined`. Throws `X2DataError` if the property cannot be reached.

	Optionally, a trace callback function can be provided with the `getValue()` call. The trace callback function is called for every prefix pointer starting with the root pointer and ending with the leaf pointer itself. So, for example, for a pointer "/a/b/c" it will be called four times: first for the root pointer (empty string), then for "/a", then for "/a/b", and finally for "/a/b/c". The callback function receives the following arguments:

	* `prefixPtr` - The current prefix pointer (instance of `RecordElementPointer`).

	* `value` - The value in the record for the current prefix pointer.

	* `prefixDepth` - Integer number representing the prefix depth. For the last call, it is zero. For the call before the last it is one, and so on. The first call (the one with the root prefix pointer), therefore, gets the number of tokens in the pointer.

* `addValue(record, value)` - Adds value to the property, at which the pointer points in the given record. If the pointer points at an array element, the value is inserted into the array at the specified by the pointer location. In all other cases, any existing value is simply replaced.

* `replaceValue(record, value)` - Like `addValue()`, but replaces an existing array element instead of inserting the value in front of it.

* `removeValue(record)` - Erase the property, at which the pointer points in the given object. If the pointer points at an array element, the element is deleted from the array and the following elements, if any, are shifted left into its place.

* `toString()` - Get string representation of the pointer as specified in RFC 6901.

Note, that `addValue()`, `replaceValue()` and `removeValue()` methods are not allowed on a root pointer. Also, `addValue()` and `replaceValue()` methods cannot take `undefined` for the value to set and `null` is not allowed for nested object array and map elements. Beyond that, the methods make no checks for the value type whether it matches the property definition or not.

The three record modification methods `addValue()`, `replaceValue()` and `removeValue()` all return the previous value as `getValue()` would return before modifying the record.

## Polymorphic Object Property Pointers

The module introduces one extension specific to the X2 Framework records. To construct a pointer to a polymorphic object property, the property name token must be prefixed with the subtype name followed with a colon. For example, if we have the following polymorphic record type definition:

```javascript
{
	...
	'Event': {
		typePropertyName: 'eventType',
		properties: {
			id: {
				valueType: 'number',
				role: 'id'
			},
			happenedOn: {
				valueType: 'datetime'
			}
		},
		subtypes: {
			'OPENED': {
				properties: {
					'byWho': {
						valueType: 'string'
					}
				}
			},
			'CLOSED': {
				properties: {
					'reason': {
						valueType: 'string'
					}
				}
			}
		}
	},
	...
}
```

Then the following are all valid pointers:

* _/happenedOn_ - The property shared by all subtypes.

* _/eventType_ - The type property.

* _/OPENED:byWho_ - The "OPENED" subtype property.

* _/CLOSED:reason_ - The "CLOSED" subtype property.

The same mechanism of prepending property name with subtype works for polymorphic nested objects as well (for example _/orders/history/events/CREATED:date_).
