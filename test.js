var fs = require('fs'),
	lang = require('./lang');

var filename = './samples/exec.ctl';

lang.parse( fs.readFileSync(filename, 'utf8'), function (err, ast) {
	if (err) {
		console.log('Parse error on line ' + err.line + ': ' + err.text);
		process.exit(1);
	} else {
		lang.ast_write(ast);
		console.log('\nExecuting...\n');
		lang.ast_execute(ast);
		console.log('\nFinished\n');
		process.exit(0);
	}
});
