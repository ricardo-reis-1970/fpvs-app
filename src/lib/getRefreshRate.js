function getRefreshRate() {
	return new Promise((resolve) => {
		let frameTimes = []
		let lastTime = performance.now()
		let frameCount = 0
		const totalFramesToCount = 60 // Higher number = higher accuracy, but takes longer

		function countFrames(timestamp) {
			frameCount++

			// Calculate time elapsed since the last frame
			const delta = timestamp - lastTime
			lastTime = timestamp

			// Skip the first frame to avoid initialization delays
			if (frameCount > 1) {
				frameTimes.push(delta)
			}

			if (frameCount < totalFramesToCount) {
				requestAnimationFrame(countFrames)
			} else {
				// Average the frame intervals (in milliseconds)
				const averageDelta = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length
				// Convert ms per frame to frames per second (Hz)
				const fps = 1000 / averageDelta
				// Round to the nearest common refresh rate standard
				resolve(Math.round(fps))
			}
		}

		requestAnimationFrame(countFrames)
	})
}

// How to use it:
getRefreshRate().then((hz) => {
	console.log(`Estimated Screen Refresh Rate: ${hz}Hz`)
})
