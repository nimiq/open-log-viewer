<template>
	<div>
		<v-toolbar color="grey lighten-5 elevation-0" :height="toolbarHeight">
			<v-btn flat icon color="grey darken-1" @click="clean">
				<v-icon :title="$t('clean')" style="font-size: 24px">delete</v-icon>
			</v-btn>

			<v-divider class="mx-3" inset vertical></v-divider>

			<v-flex xs4>
        		<v-select multiple v-model="logLevelsSelected" :items="logLevels" @change="logLevelsToShowChanged"></v-select>
			</v-flex>

			<v-spacer></v-spacer>

			<v-divider class="mx-3" inset vertical></v-divider>

			<v-btn :depressed="scrollToEnd" :flat="!scrollToEnd" icon color="grey darken-1" @click="scrollToEndClicked">
				<v-icon :title="$t('scroll-to-end')" style="font-size: 24px">vertical_align_bottom</v-icon>
			</v-btn>

			<v-btn flat icon color="grey darken-1" @click="settingsButtonClicked">
				<v-icon :title="$t('global-settings')" style="font-size: 24px">settings</v-icon>
			</v-btn>
		</v-toolbar>

		<div ref="viewer" :style="{'height': height + 'px'}"></div>
	</div>
</template>

<script>
	const Tail = require("../tail");
	const AceEditor = require("../aceEditor");
	const UserPreferences = require("../userPreferences");

    let userPreferences = new UserPreferences();

	let tail;
	let viewer;

	export default {
		props: [
			'file',
			'fileSettings',
			'globalSettings'
		],
		data() {
			return {
				toolbarHeight: 40,
				logLevels: ["Trace", "Debug", "Info", "Warning", "Error"],
				logLevelsSelected: this.getLogLevelsToShow(),
				height: this.calcHeight(),
				scrollToEnd: false,
				currentFileSettings: this.fileSettings
			}
		},
		mounted: function() {
			window.addEventListener('resize', this.handleResize);

			const viewer = AceEditor.createViewer(this.$refs.viewer, this.globalSettings);

			viewer.session.selection.on('changeCursor', e => {
				const cursor = viewer.selection.getCursor();
				const timestamp = this.getTimestampFromLine(cursor.row);
				if (timestamp) {
					const scrollOffset = viewer.session.getScrollTop() - this.getRowOffset(cursor.row);
					this.$emit("cursorTimestampChanged", timestamp, scrollOffset, cursor.column, this);
				}
			});

			this.viewer = viewer;

			this.startTail();
		},
		beforeDestroy: function() {
			tail.stop();

			window.removeEventListener('resize', this.handleResize);
		},
		methods: {
			defaultLogLevel() {
        		return this.currentFileSettings.info;
			},
			getSeveritySettings(line) {
				if (line.search(this.globalSettings.error.pattern) !== -1) {
					return this.currentFileSettings.error;
				}
				else if (line.search(this.globalSettings.warning.pattern) !== -1) {
					return this.currentFileSettings.warning;
				}
				else if (line.search(this.globalSettings.info.pattern) !== -1) {
					return this.currentFileSettings.info;
				}
				else if (line.search(this.globalSettings.debug.pattern) !== -1) {
					return this.currentFileSettings.debug;
				}
				else if (line.search(this.globalSettings.trace.pattern) !== -1) {
                    return this.currentFileSettings.trace;
                }
				else {
					return null;
				}
			},
			getLogLevelsToShow() {
				return this.fileSettings.getLogLevelsToShow().map(severity => this.capitalizeFirstLetter(severity));
			},
			logLevelsToShowChanged() {
				this.currentFileSettings.setLogLevelsToShow(this.logLevelsSelected);

				userPreferences.saveFileSettings(this.file, this.currentFileSettings);

				tail.stop();
				this.clean();
				this.startTail();
			},
			clean() {
				this.viewer.setValue("");
			},
			changeFontSize(fontSize) {
				this.viewer.setFontSize(fontSize + "px");
			},
			scrollToEndClicked() {
				this.scrollToEnd = !this.scrollToEnd;
			},
			settingsButtonClicked() {
				this.$emit('settingsButtonClicked');
			},
			startTail() {
				tail = new Tail(this.file, 1000);

				let previousLineSeveritySettings = this.defaultLogLevel();
					
				tail.on('readLines', lines => {
					lines.map(line => {
						let severitySettings = this.getSeveritySettings(line);

						if (!severitySettings) {
							severitySettings = previousLineSeveritySettings;
						}
						else {
							previousLineSeveritySettings = severitySettings;
						}

						return {
							severitySettings: severitySettings,
							line: line
						};
					})
					.filter(line => line.severitySettings.show)
					.forEach(line => {
						// Ace editor not insert empty lines, and we want all lines
						// to a better layout
						if (line.line === "") {
							line.line = " ";
						}

						const position = {
							row: this.viewer.session.getLength(),
							column: 0
						};

						this.viewer.session.insert(position, line.line + "\n");

						this.scrollToEndCommand();
					});
				});
				
				tail.start().catch(error => this.$emit('fileNotFoundError', {file: this.file}));
			},
			handleResize() {
				this.height = this.calcHeight();
			},
			calcHeight() {
				return window.innerHeight - document.querySelector(".v-tabs__bar").offsetHeight - 40;
			},
			capitalizeFirstLetter(string) {
    			return string.charAt(0).toUpperCase() + string.slice(1);
			},
			scrollToEndCommand() {
				const totalLines = this.viewer.session.getLength();

				if (this.scrollToEnd) {
					this.viewer.scrollToLine(totalLines + 1, false, false);
				}
			},
			focus() {
				this.viewer.focus();
			},
			getTimestampFromLine(row) {
				const line = this.viewer.session.getLine(row);
				const regex = /^\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(\.\d+)?)/;
				const matches = line.match(regex);
				if (matches && matches[1]) {
					let timestamp = Date.parse(matches[1]);
					return !isNaN(timestamp) ? timestamp : 0;
				}
				return 0;
			},
			scrollToTimestamp(timestamp, scrollOffset, cursorColumn) {
				const row = this.findRowAtTimestamp(timestamp);
				if (row !== false) {
					// gotoLine() needs to be called before setScrollTop().
					// Otherwise, the broken editor scrolling logic will mess up the scroll position.
					this.viewer.gotoLine(row + 1, cursorColumn, false);

					// We need to scroll manually here because editor.scrollToLine() doesn't work correctly.
					const scrollTop = this.getRowOffset(row) + scrollOffset;
					this.viewer.session.setScrollTop(scrollTop);
				}
			},
			getRowOffset(row) {
				const pos = this.viewer.session.documentToScreenPosition({row: row, column: 0});
				// FIXME Get line height from editor (or fix editor scrolling).
				//  Only works with the default font size.
				return pos.row * 18;
			},
			findRowAtTimestamp(timestamp) {
				let lo = 0;
				let hi = this.viewer.session.getLength() - 1;
				let min = Number.MAX_SAFE_INTEGER;
				let best = false;

				while (lo <= hi) {
					let mid = Math.floor((lo + hi) / 2);
					let ts = this.getTimestampFromLine(mid);
					let mid_ts = mid;
					for (let i = 1; !ts && mid - i >= lo; i++) {
						mid_ts = mid - i;
						ts = this.getTimestampFromLine(mid_ts);
					}
					for (let i = 1; !ts && mid + i <= hi; i++) {
						mid_ts = mid + i;
						ts = this.getTimestampFromLine(mid_ts);
					}
					if (!ts) {
						break;
					}

					let diff = Math.abs(timestamp - ts);
					if (diff < min) {
						min = diff;
						best = mid_ts;
					}

					if (timestamp < ts) {
						hi = mid - 1;
					} else if (timestamp > ts) {
						lo = mid + 1;
					} else {
						break;
					}
				}

				return best;
			}
		}
	}
</script>