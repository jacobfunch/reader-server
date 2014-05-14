var express = require("express"),
	app = express(),
	fs = require("fs"),
	http = require("http"),
	querystring = require('querystring'),
	jsdom = require("jsdom");

app.use(express.json());
app.use(express.urlencoded());

function OCRExtractor() {
	console.log("OCR extractor created!");

	var self = this;
}

OCRExtractor.prototype.extract = function(page, x, y, cb) {
	fs.readFile('./ocr/Page'+page+'.jpg.html', 'utf8', function (err, data) {
		if (err) throw err;

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

				var word = $("#"+word_id).text();
				cb(word);
			}
		});
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

module.exports = OCRExtractor;