var express = require("express"),
	app = express(),
	fs = require("fs"),
	http = require("http"),
	querystring = require('querystring'),
	port = process.env.PORT || 2500;

app.use(express.json());
app.use(express.urlencoded());

var nextId = 150;

/*
*	Root
*/
app.all("/", function(req, res)
{
	console.log("Someone hit us.");
	
	var json = req.body;
	var buffer = new Buffer(json.image, 'base64');

	var path = "./glass-pics/";
	var filename = "glassImage_"+nextId+".jpg";

	fs.writeFile(path+filename, buffer, function(err) {
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
			  	var result = chunk.toString();
			  	console.log("We are sending back: "+ result);
			  	res.send(result);
			  });
			});

			reqSearcher.on('error', function(e) {
			  console.log("Error: " + e.message); 
   			  console.log( e.stack );
			});

			reqSearcher.write(JSON.stringify({"filename":path+filename}));
			//reqSearcher.write(JSON.stringify({"filename":path+"glassImage_128.jpg"}));
			reqSearcher.end();

			nextId++;
		}
	});
});

app.listen(port);
console.log("Listening on port " + port);