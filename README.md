# Test 1 — Web (Vue 3): Fast Periodic Visual Stimulation

A Vue 3 + Pinia SPA with three views (Setup / Run / Results). Setup configures base rate, oddball-every-N, sequence length, and stimulus set. Run presents the stream and logs the onset of every stimulus. Results reports IOI statistics, a DFT of the onset train, and exports the raw log as CSV or JSON. Stimuli are 512×512 PNGs rendered at 400×400 on a mid-grey field; base order is randomised with no immediate repeats, oddball every 5th position.
