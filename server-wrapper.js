var express = require("express"),
	app = express(),
	fs = require("fs"),
	http = require("http"),
	port = process.env.PORT || 2800,
	Searcher = require('./searcher.js'),
	OCRExtractor = require('./ocr-extractor.js');

app.use(express.json());
app.use(express.urlencoded());

var s = new Searcher();
var ocr = new OCRExtractor();

app.all("/", function(req, res)
{
	console.log("Some one hit us in server-wrapper.js");
	console.log(req.body);

	var cb = function(page, x, y) {
		console.log(page);
		console.log(x);
		console.log(y);
		res.send(page);
		console.log("We ran cb.");
		
		ocr.extract(page, x, y, function(word) {
			console.log("Word found: " + word)
		});
	};

	s.match_file(req.body.filename, cb);
});

app.listen(port);
console.log("Listening on port " + port);