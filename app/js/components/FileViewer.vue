<template>
	<div>
		<v-toolbar color="grey lighten-5 elevation-0" :height="toolbarHeight">
			<v-btn flat icon color="grey darken-1" @click="clean">
				<v-icon :title="$t('clean')" style="font-size: 24px">delete</v-icon>
			</v-btn>

			<v-divider class="mx-3" inset vertical></v-divider>

			<v-flex xs4>
				<v-select multiple v-model="logLevelsSelected" :items="logLevels" @change="logLevelsToShowChanged">
				</v-select>
			</v-flex>

			<v-spacer></v-spacer>

			<v-flex xs4>
				<v-autocomplete select-all multiple v-model="logTagsSelected" :items="logTags"
					@change="logLevelsToShowChanged">
					<template v-slot:selection="{ item, index }">
						<v-chip v-if="index === 0">
							<span>{{ item }}</span>
						</v-chip>
						<span v-if="index === 1" class="grey--text text-caption">
							(+{{ logTagsSelected.length - 1 }} others)
						</span>
					</template>
					<template v-slot:prepend-item>
						<v-list-tile ripple @mousedown.prevent @click="toggle">
							<v-list-tile-action>
								<v-icon :color="logTagsSelected.length > 0 ? 'indigo darken-4' : ''">
									{{ icon }}
								</v-icon>
							</v-list-tile-action>
							<v-list-tile-content>
								<v-list-tile-title>
									Select All
								</v-list-tile-title>
							</v-list-tile-content>
						</v-list-tile>
						<v-divider class="mt-2"></v-divider>
					</template>
				</v-autocomplete>
			</v-flex>

			<v-spacer></v-spacer>

			<v-divider class="mx-3" inset vertical></v-divider>

			<v-btn :depressed="syncTimestamps" :flat="!syncTimestamps" icon color="grey darken-1"
				@click="syncTimestampsClicked">
				<v-icon :title="$t('sync-timestamps')" style="font-size: 24px">sync_alt</v-icon>
			</v-btn>

			<v-btn :depressed="scrollToEnd" :flat="!scrollToEnd" icon color="grey darken-1" @click="scrollToEndClicked">
				<v-icon :title="$t('scroll-to-end')" style="font-size: 24px">vertical_align_bottom</v-icon>
			</v-btn>

			<v-btn flat icon color="grey darken-1" @click="settingsButtonClicked">
				<v-icon :title="$t('global-settings')" style="font-size: 24px">settings</v-icon>
			</v-btn>
		</v-toolbar>

		<div ref="viewer" :style="{ 'height': height + 'px' }"></div>
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
			logTags: this.getAllLogTags(),
			logLevelsSelected: this.getLogLevelsToShow(),
			logTagsSelected: this.getLogTagsToShow(),
			height: this.calcHeight(),
			scrollToEnd: false,
			syncTimestamps: true,
			currentFileSettings: this.fileSettings,
			lineHeight: 20
		}
	},
	mounted: function () {
		window.addEventListener('resize', this.handleResize);

		const viewer = AceEditor.createViewer(this.$refs.viewer, this.globalSettings);

		viewer.session.selection.on('changeCursor', e => {
			const cursor = viewer.selection.getCursor();
			const timestamp = this.getTimestampFromLine(cursor.row);
			if (this.syncTimestamps && timestamp) {
				const scrollOffset = viewer.session.getScrollTop() - this.getRowOffset(cursor.row);
				this.$emit("cursorTimestampChanged", timestamp, scrollOffset, cursor.column, this);
			}
		});

		this.viewer = viewer;

		this.startTail();
	},
	beforeDestroy: function () {
		tail.stop();

		window.removeEventListener('resize', this.handleResize);
	},
	methods: {
		defaultLogLevel() {
			return this.currentFileSettings.severity.info;
		},
		getSeveritySettings(line) {
			if (line.search(this.globalSettings.error.pattern) !== -1) {
				return this.currentFileSettings.severity.error;
			}
			else if (line.search(this.globalSettings.warning.pattern) !== -1) {
				return this.currentFileSettings.severity.warning;
			}
			else if (line.search(this.globalSettings.info.pattern) !== -1) {
				return this.currentFileSettings.severity.info;
			}
			else if (line.search(this.globalSettings.debug.pattern) !== -1) {
				return this.currentFileSettings.severity.debug;
			}
			else if (line.search(this.globalSettings.trace.pattern) !== -1) {
				return this.currentFileSettings.severity.trace;
			}
			else {
				return null;
			}
		},
		getTagSettings(line) {
			let tag = line.match(/(\S+)\s*\|/);
			if (tag !== null) {
				tag = tag[1];
				if (!this.currentFileSettings.hasTag(tag)) {
					this.currentFileSettings.addTag(tag);
					this.logTags.push(tag);
					this.logTagsSelected.push(tag);
				}
				return this.currentFileSettings.tags[tag];
			}
			return null;
		},
		getAllLogTags() {
			return this.fileSettings.getAllLogTags();
		},
		getLogLevelsToShow() {
			return this.fileSettings.getLogLevelsToShow().map(severity => this.capitalizeFirstLetter(severity));
		},
		getLogTagsToShow() {
			return this.fileSettings.getLogTagsToShow();
		},
		logLevelsToShowChanged() {
			this.currentFileSettings.setLogLevelsToShow(this.logLevelsSelected);
			this.currentFileSettings.setLogTagsToShow(this.logTagsSelected);

			userPreferences.saveFileSettings(this.file, this.currentFileSettings);

			tail.stop();

			// Preserve cursor timestamp.
			const cursor = this.viewer.selection.getCursor();
			const timestamp = this.getTimestampFromParentLine(cursor.row);
			const scrollOffset = this.viewer.session.getScrollTop() - this.getRowOffset(cursor.row);
			const restoreCursor = this.scrollToTimestamp.bind(this, timestamp, scrollOffset, cursor.column);

			this.clean();
			this.startTail(restoreCursor);
		},
		clean() {
			this.viewer.setValue("");
		},
		changeFontSize(fontSize, lineHeight) {
			if(lineHeight !== 0) {
				this.lineHeight = lineHeight;
			}
			this.viewer.setFontSize(fontSize + "px");
			return this.viewer.renderer.lineHeight;
		},
		syncTimestampsClicked() {
			this.syncTimestamps = !this.syncTimestamps;
		},
		scrollToEndClicked() {
			this.scrollToEnd = !this.scrollToEnd;
		},
		settingsButtonClicked() {
			this.$emit('settingsButtonClicked');
		},
		startTail(restoreCursor) {
			tail = new Tail(this.file, 1000);

			let previousLineSeveritySettings = this.defaultLogLevel();
			let previousLineTagSettings = { show: true };

			tail.on('readLines', lines => {
				lines.map(line => {
					line = this.sanitizeLine(line);

					let severitySettings = this.getSeveritySettings(line);
					let tagSettings = this.getTagSettings(line);

					if (!severitySettings) {
						severitySettings = previousLineSeveritySettings;
						tagSettings = previousLineTagSettings;
					} else {
						previousLineSeveritySettings = severitySettings;
						previousLineTagSettings = tagSettings;
					}

					return {
						severitySettings,
						tagSettings,
						line,
					};
				})
					.filter(line => line.severitySettings.show && line.tagSettings.show)
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

				if (!this.scrollToEnd && restoreCursor) {
					restoreCursor();
					restoreCursor = null;
				}

				this.logTags.sort();
				this.logTagsSelected.sort();
			});

			tail.start().catch(error => this.$emit('fileNotFoundError', { file: this.file }));
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
			const regex = /\s*(\d{4}\W\d{2}\W\d{2}(\s+|T)\d{2}:\d{2}:\d{2}(\.\d+)?)/;
			const matches = line.match(regex);
			if (matches && matches[1]) {
				let timestamp = Date.parse(matches[1]);
				return !isNaN(timestamp) ? timestamp : 0;
			}
			return 0;
		},
		getTimestampFromParentLine(row) {
			let timeStampInLine = 0;
			let parentRow = row;
			let line;
			while (timeStampInLine === 0) {
				line = this.viewer.session.getLine(parentRow);
				timeStampInLine = this.getTimestampFromLine(parentRow,false);
				parentRow--;
				if (parentRow < 0)
					return 0;
			}
			return timeStampInLine;
		},
		scrollToTimestamp(timestamp, scrollOffset, cursorColumn) {
			if (!this.syncTimestamps) {
				return;
			}

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
			const pos = this.viewer.session.documentToScreenPosition({ row: row, column: 0 });
			return pos.row * this.lineHeight;
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
		},
		sanitizeLine(line) {
			// Strip terminal color codes.
			const regex = /\u001b\[\d+m/g;
			return line.replace(regex, '');
		},
		toggle() {
			this.$nextTick(() => {
				if (this.selectsAllTags) {
					this.logTagsSelected = []
				} else {
					this.logTagsSelected = this.logTags.slice()
				}
				this.logLevelsToShowChanged();
			})
		},
	},
	computed: {
		selectsAllTags() {
			return this.logTagsSelected.length === this.logTags.length
		},
		selectsSomeTags() {
			return this.logTagsSelected.length > 0 && !this.selectsAllTags
		},
		icon() {
			if (this.selectsAllTags) return 'check_box'
			if (this.selectsSomeTags) return 'indeterminate_check_box'
			return 'check_box_outline_blank'
		},
	},
}
</script>