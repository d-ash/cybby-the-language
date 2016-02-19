var util = require('util');

var NODE_BLOCK =	0,
	NODE_EXP =		1,
	NODE_SYMBOL =	2,
	NODE_NUMBER =	3,
	NODE_STRING =	4,
	NODE_ARRAY =	5;

var FATAL_DEFAULT =			'No error.',
	FATAL_INTERNAL =		'Internal error (bug in a parser).',
	FATAL_INDENT_SPACES =	'Malformed indentation (spaces).',
	FATAL_INDENT_EXCESS =	'Incorrect indentation (excessive).',
	FATAL_UNEXP_NUMBER =	'Unexpected character \'%s\' in a NUMBER.',
	FATAL_STRING_NO_END =	'STRING has no end.',
	FATAL_STRING_UNSUPP =	'Unsupported escaping in STRING: \'\\%s\'',
	FATAL_ARRAY_BAD =		'Cannot read array items (after %d).',
	FATAL_NO_EXP =			'No expression after a character \'(\'.',
	FATAL_EXP_BAD =			'Cannot read expression arguments (after %d).',
	FATAL_HEAD_NUMBER =		'NUMBER cannot be a head of any expression.',
	FATAL_HEAD_STRING =		'STRING cannot be a head of any expression.',
	FATAL_HEAD_ARRAY =		'ARRAY cannot be a head of any expression.',
	FATAL_LINEEXP_BAD =		'Malformed line expression. ' +
							'Probably there are unnecessary \')\' or \']\' characters.';

var exports = module.exports = {};

exports.parse = function (input, callback) {
	var input_len = input.length,
		cursor = 0,
		ast,
		line_no = 1,			// it's a common practice to start counting lines from 1
		fatal = FATAL_DEFAULT,
		indentation = -1;		// starting from the underground

	function callback_error() {
		return callback({
			'text':		fatal,
			'line':		line_no
		});
	}

	function node(type, value) {
		return {
			'type':		type,
			'value':	value,
			'line':		line_no
		};
	}

	function skip_whitespaces() {
		while (input[cursor] === ' ' || input[cursor] === '\t') {
			cursor += 1;
		}
	}

	function skip_comments() {
		var cr,
			nl;

		if (input[cursor] === ';') {
			// We are absolutely sure that there is at least one EOL at the very end.
			cr = input.indexOf('\r', cursor);	// This can be absent.
			nl = input.indexOf('\n', cursor);	// This is always present (we have attached it).
			cursor = ((cr !== -1 && cr < nl) ? cr : nl);
		}
	}

	function skip_meaningless_lines() {
		var backup;
		
		while (true) {
			backup = cursor;

			skip_whitespaces();

			if (!read_EOL()) {
				cursor = backup;	// this line has an expression in it
				break;
			}
		}
	}

	function count_tabs() {
		var n = 0;

		while (input[cursor + n] === '\t') {
			n += 1;
		}

		if (input[cursor + n] === ' ') {
			fatal = FATAL_INDENT_SPACES;
			return null;
		}

		return n;
	}

	// Does not consume any input characters.
	function process_INDENT() {
		var n = count_tabs();

		if (n === null) {
			return null;	// forward a fatal error
		}

		if (n === indentation + 1) {
			indentation += 1;
			return true;
		}

		return false;
	}

	// Does not consume any input characters.
	function process_DEDENT() {
		var n = count_tabs();

		if (n === null) {
			return null;	// forward a fatal error
		}

		if (n < indentation) {
			indentation -= 1;
			return true;
		}

		return false;
	}

	// Does not consume any input characters.
	function process_NODENT() {
		var n = count_tabs();

		if (n === null) {
			return null;	// forward a fatal error
		}

		return (n === indentation);
	}

	function read_EOL() {
		skip_comments();

		// Process Windows EOL.
		if (input[cursor] === '\r' && input[cursor + 1] === '\n') {
			cursor += 2;
			line_no += 1;

			return true;
		}

		// Process Unix or Mac EOL.
		if (input[cursor] === '\n' || input[cursor] === '\r') {
			cursor += 1;
			line_no += 1;

			return true;
		}

		return false;
	}

	// Returns <null> in case of a fatal error.
	function read_NUMBER() {
		var s = '';

		while ('0123456789'.indexOf(input[cursor]) !== -1) {
			s += input[cursor];
			cursor += 1;
		}

		if (s.length === 0) {
			return false;
		}

		if (' ];)\t\r\n'.indexOf(input[cursor]) === -1) {
			fatal = util.format(FATAL_UNEXP_NUMBER, input[cursor]);
			return null;
		}

		return node(NODE_NUMBER, parseInt(s, 10));
	}

	// Returns <null> in case of a fatal error.
	function read_STRING() {
		var s = '',
			escaped = false;

		if (input[cursor] !== "'") {
			return false;
		}

		while (true) {
			cursor += 1;

			if (cursor === input_len) {
				fatal = FATAL_STRING_NO_END;
				return null;
			}

			if (escaped) {
				switch (input[cursor]) {
					case 'r':
						s += '\r';
						break;
					case 'n':
						s += '\n';
						break;
					case 't':
						s += '\t';
						break;
					case "'":
						s += "'";
						break;
					case '\\':
						s += '\\';
						break;
					default:
						fatal = util.format(FATAL_STRING_UNSUPP, input[cursor]);
						return null;
				}
				escaped = false;
			} else {
				// Process Windows EOL.
				if (input[cursor] === '\r' && input[cursor + 1] === '\n') {
					line_no += 1;
					s += input[cursor] + input[cursor + 1];
					cursor += 1;
					continue;
				}

				// Process Unix or Mac EOL.
				if (input[cursor] === '\n' || input[cursor] === '\r') {
					line_no += 1;
					s += input[cursor];
					continue;
				}

				if (input[cursor] === "'") {
					cursor += 1;
					return node(NODE_STRING, s);
				}

				if (input[cursor] === '\\') {
					escaped = true;
				} else {
					s += input[cursor];
				}
			}

		}
	}

	// Returns <null> in case of a fatal error.
	function read_ARRAY() {
		var a = [],
			item;

		if (input[cursor] !== "[") {
			return false;
		}
		cursor += 1;

		while (true) {
			item = read_LINEITEM();

			if (item === null) {
				return null;
			}

			if (!item) {
				if (input[cursor] === ']') {
					cursor += 1;
					return node(NODE_ARRAY, a);
				} else if (read_EOL()) {
					skip_meaningless_lines();
					continue;
				} else {
					fatal = util.format(FATAL_ARRAY_BAD, a.length);
					return null;
				}
			}

			a.push(item);
		}
	}

	// Returns <null> in case of a fatal error.
	function read_SYMBOL() {
		var s = '';

		while ('[\'( ];)\t\r\n'.indexOf(input[cursor]) === -1) {
			s += input[cursor];
			cursor += 1;
		}

		if (s.length === 0) {
			return false;
		}

		return node(NODE_SYMBOL, s);
	}

	// Returns <null> in case of a fatal error.
	function read_PARENEXP() {
		var head,
			tail = [],
			item;

		if (input[cursor] !== '(') {
			return false;
		}
		cursor += 1;

		// Process a head of the expression.
		do {
			head = read_LINEITEM(true);

			if (head === null) {
				return null;	// forward a fatal error
			}

			if (!head) {
				if (read_EOL()) {
					skip_meaningless_lines();
				} else {
					fatal = FATAL_NO_EXP;
					return null;
				}
			}
		} while (head === false);

		// Process arguments.
		while (true) {
			item = read_LINEITEM();

			if (item === null) {
				return null;	// forward a fatal error
			}

			if (!item) {
				if (input[cursor] === ')') {
					cursor += 1;
					return node(NODE_EXP, {
						'head':		head,
						'tail':		tail,
						'lineexp':	false
					});
				} else if (read_EOL()) {
					skip_meaningless_lines();
					continue;
				} else {
					fatal = util.format(FATAL_EXP_BAD, tail.length);
					return null;
				}
			}

			tail.push(item);
		}
	}

	// Returns <null> in case of a fatal error.
	function read_LINEITEM(is_head) {
		var item;

		skip_whitespaces();

		item = read_NUMBER();
		if (item && is_head) {
			fatal = FATAL_HEAD_NUMBER;
			return null;
		}
		if (item || item === null) {
			return item;
		}

		item = read_STRING();
		if (item && is_head) {
			fatal = FATAL_HEAD_STRING;
			return null;
		}
		if (item || item === null) {
			return item;
		}

		item = read_ARRAY();
		if (item && is_head) {
			fatal = FATAL_HEAD_ARRAY;
			return null;
		}
		if (item || item === null) {
			return item;
		}

		item = read_PARENEXP();
		if (item || item === null) {
			return item;
		}

		item = read_SYMBOL();
		if (item || item === null) {
			return item;
		}

		return false;
	}

	// Returns <null> in case of a fatal error.
	function read_INNEREXP() {
		var head,
			tail = [],
			item;

		head = read_LINEITEM(true);
		if (!head) {
			return head;	// can be <false> or <null>
		}

		while (item = read_LINEITEM()) {
			tail.push(item);
		}
		if (item === null) {
			return null;	// forward a fatal error
		}

		return node(NODE_EXP, {
			'head':			head,
			'tail':			tail,
			'lineexp':		true
		});
	}

	// Returns <null> in case of a fatal error.
	function read_LINEEXP() {
		var exp,
			block;

		exp = read_INNEREXP();
		if (!exp) {
			return exp;		// can be <false> or <null>
		}

		if (read_EOL()) {
			block = read_BLOCK();

			if (!block) {
				return block;	// forward a fatal error
			}

			if (block.value.length > 0) {
				exp.value.tail.push(block);
			}

			return exp;
		}

		fatal = FATAL_LINEEXP_BAD;
		return null;
	}

	// Returns <null> in case of a fatal error.
	function read_BLOCK() {
		var seq = [],
			exp,
			dent;

		skip_meaningless_lines();

		dent = process_INDENT();
		if (dent === null) {
			return null;	// forward a fatal error
		}

		if (cursor < input_len && dent === true) {
			while (true) {
				if (exp = read_LINEEXP()) {
					seq.push(exp);
				}
				
				if (exp === null) {
					return null;	// forward a fatal error
				}

				skip_meaningless_lines();

				if (cursor === input_len) {
					break;
				}

				dent = process_DEDENT();
				if (dent === null) {
					return null;	// forward a fatal error
				}
				if (dent === true) {
					break;			// found the end of this block
				}

				dent = process_NODENT();
				if (dent === null) {
					return null;	// forward a fatal error
				}
				if (dent === false) {
					fatal = FATAL_INDENT_EXCESS;
					return null;
				}
			}
		}

		return node(NODE_BLOCK, seq);
	}

	// Attach EOL. It doesn't matter where we are: on Win, Unix or Mac.
	if (input[input_len - 1] !== '\n') {
		input += '\n';
		input_len += 1;
	}

	ast = read_BLOCK();
	if (ast === null) {
		return callback_error();
	}

	if (cursor === input_len) {
		return callback(null, ast);
	} else {
		fatal = FATAL_INTERNAL;
		return callback_error();
	}
}

exports.ast_write = function (ast) {
	var indentation = -1;

	function output(s) {
		process.stdout.write(s);
	}

	function output_indent() {
		var tabs = '',
			i;

		for (i = 0; i < indentation; i += 1) {
			tabs += '\t';
		}

		output(tabs);
	}

	function node_write(node, no_EOL) {
		var i,
			len;

		switch (node.type) {
			case NODE_BLOCK:
				if (!no_EOL) {
					output('\n');
				}

				indentation += 1;

				len = node.value.length;
				for (i = 0; i < len; i += 1) {
					node_write(node.value[i]);

					if (i < len - 1) {
						output('\n');
					}
				}
				indentation -= 1;

				break;

			case NODE_EXP:
				if (node.value.lineexp) {
					output_indent();
				} else {
					output('(');
				}

				node_write(node.value.head);

				len = node.value.tail.length;
				for (i = 0; i < len; i += 1) {
					output(' ');
					node_write(node.value.tail[i]);
				}

				if (!node.value.lineexp) {
					output(')');
				}

				break;

			case NODE_SYMBOL:
				output(node.value);
				break;

			case NODE_NUMBER:
				output(node.value.toString());
				break;

			case NODE_STRING:
				output("'" +
					node.value
						.replace(/\\/g, '\\\\')
						.replace(/\r/g, '\\r')
						.replace(/\n/g, '\\n')
						.replace(/\t/g, '\\t')
						.replace(/'/g, "\\'")
					+ "'");
				break;

			case NODE_ARRAY:
				output('[');

				len = node.value.length;
				for (i = 0; i < len; i += 1) {
					if (i > 0) {
						output(' ');
					}
					node_write(node.value[i]);
				}

				output(']');

				break;

			default:
				console.log('Error in AST. Unknown type of node: ' + node.type);
				break;
		}
	}

	node_write(ast, true);
	output('\n');
}

exports.ast_execute = function (ast) {
	function func_PRINT() {
		var i,
			s = '';

		for (i = 0; i < arguments.length; i += 1) {
			s += arguments[i].toString();
		}

		process.stdout.write(s);

		return s;
	}

	function func_PLUS() {
		var i,
			n = 0;

		for (i = 0; i < arguments.length; i += 1) {
			n += arguments[i];
		}

		return n;
	}

	function func_MINUS() {
		var i,
			n;

		n = arguments[0];
		for (i = 1; i < arguments.length; i += 1) {
			n -= arguments[i];
		}

		return n;
	}

	function func_MUL() {
		var i,
			n = 1;

		for (i = 0; i < arguments.length; i += 1) {
			n *= arguments[i];
		}

		return n;
	}

	function func_DIV() {
		return (arguments[0] / arguments[1]);
	}

	var SYMBOL_CONST =	0,
		SYMBOL_FUNC =	1;

	var SYMBOLS = {
		'да': {
			'type':		SYMBOL_CONST,
			'value':	true
		},
		'нет': {
			'type':		SYMBOL_CONST,
			'value':	false
		},
		'печатать': {
			'type':		SYMBOL_FUNC,
			'value':	func_PRINT
		},
		'+': {
			'type':		SYMBOL_FUNC,
			'value':	func_PLUS
		},
		'-': {
			'type':		SYMBOL_FUNC,
			'value':	func_MINUS
		},
		'*': {
			'type':		SYMBOL_FUNC,
			'value':	func_MUL
		},
		'/': {
			'type':		SYMBOL_FUNC,
			'value':	func_DIV
		},

		/*
		'controls': [
			// if, while, return
			//'вернуть':	'RETURN'
		]
		*/
	};

	function node_execute(node) {
		var i,
			len,
			val,
			arr;

		switch (node.type) {
			case NODE_BLOCK:
				len = node.value.length;
				for (i = 0; i < len; i += 1) {
					val = node_execute(node.value[i]);
				}
				return val;

			case NODE_EXP:
				arr = [];
				val = node_execute(node.value.head);

				len = node.value.tail.length;
				for (i = 0; i < len; i += 1) {
					arr.push(node_execute(node.value.tail[i]));
				}

				return val.apply(undefined, arr);

			case NODE_SYMBOL:
				if (SYMBOLS.hasOwnProperty(node.value)) {
					switch (SYMBOLS[node.value].type) {
						case SYMBOL_CONST:
							return SYMBOLS[node.value].value;
						case SYMBOL_FUNC:
							return SYMBOLS[node.value].value;
						default:
							return null;
					}
				}
				return null;

			case NODE_NUMBER:
			case NODE_STRING:
				return node.value;

			case NODE_ARRAY:
				arr = [];

				len = node.value.length;
				for (i = 0; i < len; i += 1) {
					arr.push(node_execute(node.value[i]));
				}

				return arr;

			default:
				console.log('Error in AST. Unknown type of node: ' + node.type);
				return null;
		}
	}

	node_execute(ast);
}
