var express = require("express"),
	app = express(),
	fs = require("fs"),
	http = require("http"),
	https = require("https"),
	querystring = require('querystring'),
	jsdom = require("jsdom"),
	request = require("request"),
	googleapis = require('googleapis'),
	MsTranslator = require('mstranslator');

app.use(express.json());
app.use(express.urlencoded());

var api_key = "AIzaSyBoTGWsuL5ouFkm7Q3Ln4D4HD6Ab87RFv0"; // https://console.developers.google.com/project/apps~podiadd-app-static/apiui/credential?authuser=0

var tasks = ['wikipedia', 'translator'];
var urls = {
		google: "https://www.googleapis.com/customsearch/v1?q=%%WORD%%&cx=016852346807244731097%3Aukvjpqvo1aw&num=2&key="+api_key,
		wikipedia: "http://en.wikipedia.org/w/api.php?action=query&prop=extracts&format=json&exintro=&titles=%%WORD%%",
		wikipedia_alternative: "http://en.wiktionary.org/w/api.php?action=query&prop=extracts&format=json&titles=%%WORD%%",
	};

function OCRExtractor() {
	console.log("OCR extractor created!");

	var self = this;
}

OCRExtractor.prototype.extract = function(page, x, y, cb) {
	console.log("Opening extract.");
	fs.readFile('./ocr/Page'+page+'.jpg.html', 'utf8', function (err, data) {
		if (err) throw err;

		console.log("OCR file read.");
		jsdom.env({
			html: data,
			scripts: ["assets/jquery-1.11.0.min.js"],
			done: function (errors, window) {
				var $ = window.$;

				var pageWidth = $("div.ocr_page").attr('title').split(";")[1].split(" ")[4];
				var pageHeight = $("div.ocr_page").attr('title').split(";")[1].split(" ")[5];
				
				var glassX_px = pageWidth * x;
				var glassY_px = pageHeight * y;

				var line_id = findLine($, glassY_px);
				var word_id = findWordByLine($, line_id, glassX_px);

				var word = $("#"+word_id);

				var paragraph = "";
				var words_before = Array.prototype.reverse.call(word.prevAll().slice(0, 5));
				words_before.each(function() {
					paragraph += $(this).text() + " ";
				});

				var word_count_before = paragraph.length;
				paragraph += word.text() + " ";

				var words_after = word.nextAll().slice(0, 5);
				words_after.each(function() {
					paragraph += $(this).text() + " ";
				});
				
				handleResult(word.text(), word_count_before, page, paragraph, function(result) {
					console.log(result);
					cb(result);
				});
			}
		});
	});
}

var handleResult = function(word, word_position, page, paragraph, callback) {
	var return_array = {};
	var count = 0;

	return_array.word = word;
	return_array.word_position = word_position;
	return_array.paragraph = paragraph.trim();
	return_array.page = page;

	var completed_requests = function() {
		count++;

		console.log(count);

		if (count == tasks.length) {
			console.log("We ran all");
			callback(return_array);
		}
	};

	var google_result = HTTPGet(urls.google.replace("%%WORD%%", word), function(data) {
		console.log("Google word: " + word);
		var result = data.toString();
		var json = JSON.parse(result);

		var snippet = json.items[0].snippet;
		var title = json.items[0].title;

		return_array.wikipedia_title = title;
		return_array.wikipedia_snippet = snippet.substring(0, 120);
		completed_requests();
	});

	var client = new MsTranslator({client_id:"googleglass", client_secret: "KB8BPkPcfR5ft5Db13xwWz/E0kH9z8vHlp+aFUmRSb8="});
	var params = { 
		text: paragraph
		, from: 'en'
		, to: 'da'
	};

	client.initialize_token(function(keys){ 
		client.translate(params, function(err, data) {
			console.log("Translation done.");
			return_array.translation = data;
			completed_requests();
		});
	});
}

var HTTPGet = function(url, callback) {
	var req = https.get(url, function(res) {
		res.setEncoding('utf8');
	});

	req.on('response', function (response) {
		var data = "";

		response.on('data', function (chunk) {
			data += chunk;
		});

		response.on('end', function(){
			callback(data);
		});
	});

	req.on('error', function(e) {
		console.log("Error: " + e.message); 
		console.log( e.stack );
	});
}

var findLine = function($, y_coordinate) {
	var foundAccurate = false;
	var foundClosest = 0;
	var lineFound = null;

	$("span.ocr_line").each(function() {
		var lineY_start = parseFloat($(this).attr('title').split(" ")[2]);
		var lineY_end = parseFloat($(this).attr('title').split(" ")[4]);
		var lineCenter = (lineY_start + lineY_end)/2;

		// Check if coordinate is inside bounding box.
		if ( y_coordinate > lineY_start && y_coordinate < lineY_end ) {
			lineFound = $(this);
			foundAccurate = true;
		} else if ( !foundAccurate ) {
			tmpClosest = Math.abs(y_coordinate - lineCenter);
			if ( tmpClosest < foundClosest || foundClosest == 0 ) {
				foundClosest = tmpClosest;
				lineFound = $(this);
			}
		}
	});

	return lineFound.attr('id');
}

var findWordByLine = function($, line_id, x_coordinate) {
	var foundAccurate = false;
	var foundClosest = 0;
	var wordFound = null;

	$("#"+line_id).find('span').each(function() {
		var wordX_start = parseFloat($(this).attr('title').split(" ")[1]);
		var wordX_end = parseFloat($(this).attr('title').split(" ")[3]);
		var wordCenter = (wordX_start + wordX_end)/2;

		// Check if coordinate is inside bounding box.
		if ( x_coordinate > wordX_start && x_coordinate < wordX_end ) {
			wordFound = $(this);
			foundAccurate = true;
		} else if ( !foundAccurate ) {
			tmpClosest = Math.abs(x_coordinate - wordCenter);
			if ( tmpClosest < foundClosest || foundClosest == 0 ) {
				foundClosest = tmpClosest;
				wordFound = $(this);
			}
		}
	});

	return wordFound.attr('id');
}

// var test = new OCRExtractor();
// test.extract(280, .25, .20, function() {});

module.exports = OCRExtractor;