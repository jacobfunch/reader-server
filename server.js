var express = require("express"),
	app = express(),
	fs = require("fs"),
	http = require("http"),
	querystring = require('querystring'),
	port = process.env.PORT || 2500;

app.use(express.json());
app.use(express.urlencoded());

var nextId = 0;

/*
*	Root
*/
app.all("/", function(req, res)
{
	console.log("Someone hit us.");
	
	var json = req.body;
	var buffer = new Buffer(json.image, 'base64');

	var filename = "glassImage_"+nextId+".jpg";

	fs.writeFile(filename, buffer, function(err) {
		if(err) {
			console.log(err);
		} else {
			console.log("The file was saved!");
			
			var options = {
			  hostname: 'localhost',
			  port: 2800,
			  path: '/',
			  method: 'POST',
			  headers: {
			  	'Content-Type': 'application/json'
			  },
			};

			var reqSearcher = http.request(options, function(result) {
			  result.on('data', function (chunk) {
			  	var resultFilename = chunk.toString();
			  	var pageNumber = resultFilename.replace(/[A-Za-z$-.\/]/g, "") - 14;
			  	res.send("Page: "+ pageNumber);
			  });
			});

			reqSearcher.on('error', function(e) {
			  console.log("Error: " + e.message); 
   			  console.log( e.stack );
			});

			reqSearcher.write(JSON.stringify({"filename":"./matching_to_many_images/query4.jpg"}));
			reqSearcher.end();

			nextId++;
		}
	});
});

app.listen(port);
console.log("Listening on port " + port);