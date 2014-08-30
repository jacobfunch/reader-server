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

OCRExtractor.prototype.extract = function(page, left, center, right, cb) {
	console.log("Opening extract.");
	fs.readFile('./ocr/User/Page'+page+'.jpg.html', 'utf8', function (err, data) {
		if (err) throw err;

		console.log("OCR file read.");
		jsdom.env({
			html: data,
			scripts: ["assets/jquery-1.11.0.min.js"],
			done: function (errors, window) {
				var $ = window.$;

				var pageWidth = $("div.ocr_page").attr('title').split(";")[1].split(" ")[4];
				var pageHeight = $("div.ocr_page").attr('title').split(";")[1].split(" ")[5];

				console.log(left);
				console.log(center);
				console.log(right);

				center = JSON.parse(center);
				
				var glassLeft_px = pageWidth * left;
				var glassRight_px = pageWidth * right;
				var glassCenterX_px = pageWidth * center[0];
				var glassCenterY_px = pageHeight * center[1];

				var line_id = findLine($, glassCenterY_px);
				var word_ids = findWordByLine($, line_id, glassLeft_px, glassRight_px);

				console.log(line_id);
				console.log(glassCenterY_px);

				var paragraph = "";
				var words_before = Array.prototype.reverse.call($(word_ids[0]).prevAll().slice(0, 5));
				words_before.each(function() {
					paragraph += $(this).text() + " ";
				});

				var word_count_before = paragraph.length;
				var words = "";
				for (var i = 0; i < word_ids.length; i++) {
					var current = word_ids[i];
					paragraph += $(current).text() + " ";
					words += $(current).text() + " ";
				};

				words = $.trim(words);

				var words_after = $(word_ids[word_ids.length -1]).nextAll().slice(0, 5);
				words_after.each(function() {
					paragraph += $(this).text() + " ";
				});
				
				handleResult(words, word_count_before, page, paragraph, function(result) {
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
	var first_time_error = true;

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

	var google_result = function(word_to_replace) {
		HTTPGet(urls.google.replace("%%WORD%%", word_to_replace), function(data) {
			console.log("Google word: " + word_to_replace);
			console.log(data);
			var result = data.toString();
			var json = JSON.parse(result);

			if ( json.spelling && first_time_error ) {
				google_result(json.spelling.correctedQuery);
				first_time_error = false;
				return;
			}

			var snippet = json.items[0].snippet;
			var title = json.items[0].title;

			return_array.wikipedia_title = title;
			return_array.wikipedia_snippet = snippet.substring(0, 120);
			completed_requests();
		});
	};
	google_result(word);

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
		var lineHeight = lineY_start - lineY_end;

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

var findWordByLine = function($, line_id, start, end) {
	var foundAccurate = false;
	var foundClosest = 0;
	var wordFound = null;

	var list_of_ids = [];
	var wrongly_found = "";

	$("#"+line_id).find('span').each(function() {
		var wordX_start = parseFloat($(this).attr('title').split(" ")[1]);
		var wordX_end = parseFloat($(this).attr('title').split(" ")[3]);
		var word_width = wordX_end - wordX_start;
		var wordCenter = (wordX_start + wordX_end)/2;

		// Check if coordinate is inside bounding box.
		if ( start < wordX_start + (word_width / 2) && end > wordX_start + (word_width / 2) ) {
			list_of_ids.push($(this));
			foundAccurate = true;
		} else if ( !foundAccurate ) {
			tmpClosest = Math.abs(start - wordCenter);
			if ( tmpClosest < foundClosest || foundClosest == 0 ) {
				foundClosest = tmpClosest;
				wrongly_found = $(this);
			}
		}
	});

	if ( list_of_ids.length == 0 )
		return wrongly_found;
	else
		return list_of_ids;
}

// var test = new OCRExtractor();
// test.extract(1, 0.561005, "[0.650628, 0.605454]", 0.751675, function() {});

module.exports = OCRExtractor;