<script lang="ts">
</script>

<head>
	<title>Slidep</title>
</head>

<body>
	<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Montserrat" />
	<div class="topnav">
		<a href="/">Slidep</a>
	</div>

	<div class="center">
		<div>
			<!-- <a class="button" href="/statics">Statics</a> -->
		</div>
		<div>
			<a class="button" href="/kinematics">Kinematics</a>
		</div>
	</div>
</body>

<style>
	body {
		background: #ffedc6;
		font-family: 'Sofia', sans-serif;
	}
	.topnav {
		background-color: #ffbe80;
		overflow: hidden;
	}
	.topnav a {
		float: left;
		color: #db5000;
		text-align: center;
		padding: 4px 6px;
		text-decoration: none;
		font-size: 24px;
		font-weight: bolder;
	}
	.center {
		margin: 0;
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
	}
	.button {
		display: inline-block;
		background: #b7e2ff;
		color: #001d59;
		font-size: large;
		font-weight: 700;
		padding: 5pt;
		border: #001d59 solid 2pt;
		border-radius: 3pt;
		margin: 8pt;
		transition: color 0.2s ease;
		background-size: 100% 100%;
	}
	.button:hover {
		transform: scale(100%);
		color: #db5000;
		border-color: #db5000;
	}

	.button::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		width: 0%;
		height: 100%;
		background-color: #ffbe80;
		color: #db5000;
		border-color: #db5000;
		border-radius: 3pt;
		z-index: -1;
		transition: width 0.12s ease;
	}

	.button:hover::before {
		width: 100%;
		border-radius: 1pt;
	}
</style>
