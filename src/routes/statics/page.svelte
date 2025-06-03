<script>
	// Get the canvas element and its context
	const canvas = document.getElementById('myCanvas');
	const ctx = canvas.getContext('2d');

	// Set initial canvas size
	resizeCanvas();

	// Function to resize the canvas to fit the window
	function resizeCanvas() {
		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;

		// Redraw content or handle other operations after resizing
		draw();
	}

	// Function to draw on the canvas
	function draw() {
		// Example: Draw a rectangle
		ctx.fillStyle = 'blue';
		ctx.fillRect(10, 10, 50, 50);
	}

	// Call resizeCanvas() when the window is resized
	window.addEventListener('resize', resizeCanvas);

	// Initial draw
	draw();
</script>

<body>
	<canvas id="myCanvas"></canvas>
</body>
