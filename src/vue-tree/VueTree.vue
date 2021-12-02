<template>
	<div class="tree-container" ref="container">
		<svg class="svg vue-tree" ref="svg" :style="initialTransformStyle" />
		<div class="dom-container" ref="domContainer" :style="initialTransformStyle">
			<transition-group name="tree-node-item" tag="div">
				<div
					class="node-slot"
					v-for="(node, index) of nodeDataList"
					@click="onClickNode(index)"
					:key="node.data._key"
					:style="{
						left: formatDimension(direction === DIRECTION.VERTICAL ? node.x : node.y),
						top: formatDimension(direction === DIRECTION.VERTICAL ? node.y : node.x),
						width: formatDimension(config.nodeWidth),
						height: formatDimension(config.nodeHeight)
					}"
				>
					<slot name="node" v-bind:node="node.data" v-bind:collapsed="node.data._collapsed">
						<!-- 默认展示value字段 -->
						<span>{{ node.data.value }}</span>
					</slot>
				</div>
			</transition-group>
		</div>
	</div>
</template>


<script lang="ts">
import * as d3 from 'd3';
import { uuid } from '../base/utils';
// import Vue, { VNode, PropType } from 'vue';
import { VueTreeChart } from './types';
import { Component, Vue, Watch, Prop } from 'vue-property-decorator';
const MATCH_TRANSLATE_REGEX = /translate\((-?\d+)px, ?(-?\d+)px\)/i;
const MATCH_SCALE_REGEX = /scale\((\S*)\)/i;

const LinkStyle = {
	CURVE: 'curve',
	STRAIGHT: 'straight',
};

const DIRECTION = {
	VERTICAL: 'vertical',
	HORIZONTAL: 'horizontal',
};

const DEFAULT_NODE_WIDTH = 100;
const DEFAULT_NODE_HEIGHT = 100;
const DEFAULT_LEVEL_HEIGHT = 200;
/**
	* Used to decrement the height of the 'initTransformY' to center diagrams.
	* This is only a hotfix caused by the addition of '__invisible_root' node
	* for multi root purposes.
	*/

const DEFAULT_HEIGHT_DECREMENT = 200;

const ANIMATION_DURATION = 800;


function rotatePoint({ x, y }: any): any {
	return {
		x: y,
		y: x,
	};
}
@Component({})
export default class VueTree extends Vue {
	$refs!: {
		domContainer: HTMLElement;
		container: HTMLElement;
		svg: HTMLElement;
	};
	svg: any = null;
	@Prop({
		type: Object,
		default: () => {
			return {
				nodeWidth: DEFAULT_NODE_WIDTH,
				nodeHeight: DEFAULT_NODE_HEIGHT,
				levelHeight: DEFAULT_LEVEL_HEIGHT,
			};
		},
	})
	config!: any;
	@Prop({
		type: String,
		default: LinkStyle.CURVE,
	})
	linkStyle!: any;
	@Prop()
	linkStyleIdMap!: VueTreeChart.ILinkStyleIdMap;
	@Prop({
		type: String,
		default: DIRECTION.VERTICAL,
	})
	direction!: any;
	@Prop({
		type: Boolean,
		default: true,
	})
	collapseEnabled!: any;
	@Prop({
		type: [Object, Array],
		required: true,
	})
	dataset!: any;
	@Prop({
		type: Boolean,
		default: false
	})
	isSync!: boolean;
	@Prop({
		type: Function,
		default: () => {

		},
	})
	nodeClick!: Function;
	@Prop({
		type: Function,
		default: () => {

		},
	})
	leafClick!: Function;
	d3 = d3;
	colors = '568FE1';
	nodeDataList = [];
	// LindDataList: Array<{
	//   source: Node;
	//   target: Node;
	linkDataList: Array<any> = [];
	initTransformX = 0;
	initTransformY = 0;
	DIRECTION = DIRECTION;
	currentScale = 1;


	get initialTransformStyle() {
		return {
			transform: `scale(1) translate(${this.initTransformX}px, ${this.initTransformY}px)`,
			transformOrigin: 'center',
		};
	};
	get _dataset(): VueTreeChart.DataSet | Array<VueTreeChart.DataSet> {
		return this.updatedInternalData(this.dataset);
	};
	mounted() {
		this.init();
	};
	init() {
		this.draw();
		this.enableDrag();
		this.initTransform();
	};
	zoomIn(scale=1.2) {
		const originTransformStr = this.$refs.domContainer.style.transform;
		// 如果已有scale属性, 在原基础上修改
		let targetScale = 1 * scale;
		const scaleMatchResult = originTransformStr.match(MATCH_SCALE_REGEX);
		if (scaleMatchResult && scaleMatchResult.length > 0) {
			const originScale = parseFloat(scaleMatchResult[1]);
			targetScale *= originScale;
		}
		this.setScale(targetScale);
	};
	initKey(children: any) {
		for (const child of children) {
			child._key = uuid();
		}
		return children;
	};
	zoomOut(scale=1.2) {
		const originTransformStr = this.$refs.domContainer.style.transform;
		// 如果已有scale属性, 在原基础上修改
		let targetScale = 1 / scale;
		const scaleMatchResult = originTransformStr.match(MATCH_SCALE_REGEX);
		if (scaleMatchResult && scaleMatchResult.length > 0) {
			const originScale = parseFloat(scaleMatchResult[1]);
			targetScale = originScale / scale;
		}
		this.setScale(targetScale);
	};
	restoreScale() {
		this.setScale(1);
	};

	setScale(scaleNum: any) {
		if (typeof scaleNum !== 'number') return;
		const pos = this.getTranslate();
		const translateString = `translate(${pos[0]}px, ${pos[1]}px)`;
		if (this.$refs.svg.style) {
			this.$refs.svg.style.transform = `scale(${scaleNum}) ` + translateString;
		}
		this.$refs.domContainer.style.transform =
			`scale(${scaleNum}) ` + translateString;
		this.currentScale = scaleNum;
	}
	getTranslate() {
		const string = this.$refs.svg.style.transform;
		const match = string.match(MATCH_TRANSLATE_REGEX);
		if (match === null) {
			return [null, null];
		}
		const x = parseInt(match[1]);
		const y = parseInt(match[2]);
		return [x, y];
	}
	isVertical() {
		return this.direction === DIRECTION.VERTICAL;
	}
	/**
		* Returns updated dataset by deep copying every nodes from the externalData and adding unique '_key' attributes.
		**/
	updatedInternalData(externalData: any): VueTreeChart.DataSet | Array<VueTreeChart.DataSet> {
		const data: any = { name: '__invisible_root', children: [] };
		if (!externalData) return data;
		if (Array.isArray(externalData)) {
			for (let i = externalData.length - 1; i >= 0; i--) {
				data.children.push(this.deepCopy(externalData[i]));
			}
		} else {
			data.children.push(this.deepCopy(externalData));
		}
		return data;
	}
	/**

		* Returns a deep copy of selected node (copy of itself and it's children).
		* If selected node or it's children have no '_key' attribute it will assign a new one.
		**/
	deepCopy(node: any) {
		const obj: any = { _key: uuid() };
		for (const key in node) {
			if (key === 'data'||key === 'dataIdList') {
				obj[key] = node[key];
				continue;
			}
			if (node[key] === null) {
				obj[key] = null;
			} else if (Array.isArray(node[key])) {
				obj[key] = node[key].map((x: any) => this.deepCopy(x));
			} else if (typeof node[key] === 'object') {
				obj[key] = this.deepCopy(node[key]);
			} else {
				obj[key] = node[key];
			}
		}
		return obj;
	}
	initTransform(): void {
		const containerWidth = this.$refs.container.offsetWidth;
		const containerHeight = this.$refs.container.offsetHeight;
		if (this.isVertical()) {
			this.initTransformX = Math.floor(containerWidth / 2);
			this.initTransformY = Math.floor(
				this.config.nodeHeight - DEFAULT_HEIGHT_DECREMENT,
			);
		} else {
			this.initTransformX = Math.floor(
				this.config.nodeWidth - DEFAULT_HEIGHT_DECREMENT,
			);
			this.initTransformY = Math.floor(containerHeight / 2);
		}
	}
	/**
		* 根据link数据,生成svg path data
		*/
	generateLinkPath(d: any) {
		const self = this;
		if (this.linkStyle === LinkStyle.CURVE) {
			const linkPath = this.isVertical() ? d3.linkVertical() : d3.linkHorizontal();
			linkPath
				.x((d: any) => {
					return d.x;
				})
				.y((d: any) => {
					return d.y;
				})
				.source((d: any): any => {
					const sourcePoint = {
						x: d.source.x + Math.floor(Math.random() * 30),
						y: d.source.y,
					};
					return self.direction === self.DIRECTION.VERTICAL ?
						sourcePoint :
						rotatePoint(sourcePoint);
				})
				.target((d: any): any => {
					const targetPoint = {
						x: d.target.x + Math.floor(Math.random() * 30),
						y: d.target.y,
					};
					return self.direction === self.DIRECTION.VERTICAL ?
						targetPoint :
						rotatePoint(targetPoint);
				});
			return linkPath(d);
		}
		if (this.linkStyle === LinkStyle.STRAIGHT) {
			// the link path is: source -> secondPoint -> thirdPoint -> target
			const linkPath = d3.path();
			let sourcePoint = { x: d.source.x, y: d.source.y };
			let targetPoint = { x: d.target.x, y: d.target.y };
			if (!this.isVertical()) {
				sourcePoint = rotatePoint(sourcePoint);
				targetPoint = rotatePoint(targetPoint);
			}
			const xOffset = targetPoint.x - sourcePoint.x;
			const yOffset = targetPoint.y - sourcePoint.y;
			const secondPoint = this.isVertical() ?
				{ x: sourcePoint.x, y: sourcePoint.y + yOffset / 2 } :
				{ x: sourcePoint.x + xOffset / 2, y: sourcePoint.y };
			const thirdPoint = this.isVertical() ?
				{ x: targetPoint.x, y: sourcePoint.y + yOffset / 2 } :
				{ x: sourcePoint.x + xOffset / 2, y: targetPoint.y };
			linkPath.moveTo(sourcePoint.x, sourcePoint.y);
			linkPath.lineTo(secondPoint.x, secondPoint.y);
			linkPath.lineTo(thirdPoint.x, thirdPoint.y);
			linkPath.lineTo(targetPoint.x, targetPoint.y);
			return linkPath.toString();
		}
	}
	draw(): void {
		let [nodeDataList, linkDataList] = this.buildTree(this._dataset);
		// Do not render the invisible root node.
		nodeDataList.splice(0, 1);
		linkDataList = linkDataList.filter(

			(x: any) => x.source.data.name !== '__invisible_root',
		);
		// this.linkDataList = linkDataList;
		this.linkDataList = [];
		for (const linkData of linkDataList) {
			if (Array.isArray(linkData.source.data.dataIdList) && Array.isArray(linkData.target.data.dataIdList)) {
				const linkIdList = linkData.source.data.dataIdList.filter(dataId => linkData.target.data.dataIdList?.find(tId => tId === dataId)!==undefined);
				// linkData.style={};
				for (const linkId of linkIdList) {
					linkData.style = this.linkStyleIdMap[linkId] || null;
					this.linkDataList.push({...linkData});
				}
			} else {
				this.linkDataList.push(linkData);
			}
		}
		this.nodeDataList = nodeDataList;
		const identifier = this.dataset['identifier'];
		const specialLinks = this.dataset['links'];
		if (specialLinks && identifier) {
			for (const link of specialLinks) {
				let parent;
				let children = undefined;
				if (identifier === 'value') {

					parent = this.nodeDataList.find((d: any) => {
						return d[identifier] == link.parent;
					});
					children = this.nodeDataList.filter((d: any) => {
						return d[identifier] == link.child;
					});
				} else {
					parent = this.nodeDataList.find((d: any) => {
						return d['data'][identifier] == link.parent;
					});
					children = this.nodeDataList.filter((d: any) => {
						return d['data'][identifier] == link.child;
					});
				}
				if (parent && children) {
					for (const child of children) {
						const new_link = {
							source: parent,
							target: child,
						};
						this.linkDataList.push(new_link);
					}
				}
			}
		}

		this.svg = this.d3.select(this.$refs.svg);

		const self = this;

		const links = this.svg.selectAll('.link').data(this.linkDataList, (d: any, i: any) => {
			console.log(i);
			return `${d.source.data._key}-${d.target.data._key}-${i}`;
		});
		links
			.enter()
			.append('path')
			.style('opacity', 0)
			.transition()
			.duration(ANIMATION_DURATION)
			.ease(d3.easeCubicInOut)
			.style('opacity', 1)
			.style('stroke', (d: any) => {
				console.log(d);
				if(d.style?.['stroke']){
					return d.style?.['stroke'];
				}
				return "hsl(" + 10 + ",100%,50%) "
			})
			.style('stroke-dasharray', (d: any) => {
				console.log(d);
				if(d.style?.['stroke-dasharray']){
					return d.style?.['stroke-dasharray'];
				}
				return ""
			})
			.attr('class', 'link')
			.attr('d', function (d: any, i: number) {
				return self.generateLinkPath(d);
			});
		links
			.transition()
			.duration(ANIMATION_DURATION)
			.ease(d3.easeCubicInOut)
			.attr('d', function (d: any) {
				return self.generateLinkPath(d);
			});
		links
			.exit()
			.transition()
			.duration(ANIMATION_DURATION / 2)
			.ease(d3.easeCubicInOut)
			.style('opacity', 0)
			.remove();
	}
	buildTree(rootNode: any): [any, Array<VueTreeChart.ILinkData>] {
		const treeBuilder = this.d3
			.tree()
			.nodeSize([this.config.nodeWidth, this.config.levelHeight]);
		const tree: any = treeBuilder(this.d3.hierarchy(rootNode));
		return [tree.descendants(), tree.links()];
	}
	enableDrag() {
		const svgElement = this.$refs.svg;
		const container = this.$refs.container;
		let startX = 0;
		let startY = 0;
		let isDrag = false;
		// 保存鼠标点下时的位移
		let mouseDownTransform = '';
		container.onmousedown = (event: any) => {
			mouseDownTransform = svgElement.style.transform;
			startX = event.clientX;
			startY = event.clientY;
			isDrag = true;
		};
		container.onmousemove = (event: any) => {
			if (!isDrag) return;
			const originTransform = mouseDownTransform;
			let originOffsetX = 0;
			let originOffsetY = 0;
			if (originTransform) {
				const result = originTransform.match(MATCH_TRANSLATE_REGEX);
				if (result !== null && result.length !== 0) {
					const [offsetX, offsetY] = result.slice(1);
					originOffsetX = parseInt(offsetX);
					originOffsetY = parseInt(offsetY);
				}
			}
			const newX =
				Math.floor((event.clientX - startX) / this.currentScale) + originOffsetX;
			const newY =
				Math.floor((event.clientY - startY) / this.currentScale) + originOffsetY;
			let transformStr = `translate(${newX}px, ${newY}px)`;
			if (originTransform) {
				transformStr = originTransform.replace(MATCH_TRANSLATE_REGEX, transformStr);
			}
			svgElement.style.transform = transformStr;
			this.$refs.domContainer.style.transform = transformStr;
		};

		container.onmouseup = (event: any) => {
			startX = 0;
			startY = 0;
			isDrag = false;
		};
	}
	async onClickNode(index: number): Promise<any> {
		if (this.collapseEnabled) {
			const curNode: any = this.nodeDataList[index];
			this.nodeClick(curNode.data);
			if (this.isSync && curNode.data.children == null) {
				const children = await this.leafClick(this.deepCopy(curNode.data));
				curNode.data.children = this.initKey(children);
				curNode.data._children = null;
				curNode.data._collapsed = false;
			} else {
				if (curNode.data.children) {
					curNode.data._children = curNode.data.children;
					curNode.data.children = null;
					curNode.data._collapsed = true;
				} else {
					curNode.data.children = curNode.data._children;
					curNode.data._children = null;
					curNode.data._collapsed = false;
				}
			}
			this.draw();
		}
	}
	formatDimension(dimension: any): string {
		if (typeof dimension === 'number') return `${dimension}px`;
		if (dimension.indexOf('px') !== -1) {
			return dimension;
		} else {
			return `${dimension}px`;
		}
	}
	parseDimensionNumber(dimension: any): number {
		if (typeof dimension === 'number') {
			return dimension;
		}
		return parseInt(dimension.replace('px', ''));
	}
	@Watch("_dataset", { deep: true })
	changeDataset(): void {
		this.draw();
		this.initTransform();
	}

}
</script>

<style lang="scss">
.tree-container {
	.node {
		fill: grey !important;
	}

	.link {
		stroke-width: 2px !important;
		fill: transparent !important;
		// stroke: #cecece !important;
	}
}
</style>

<style lang="scss" scoped>
.tree-node-item-enter,
.tree-node-item-leave-to {
	transition-timing-function: ease-in-out;
	transition: transform 0.8s;
	opacity: 0;
}

.tree-node-item-enter-active,
.tree-node-item-leave-active {
	transition-timing-function: ease-in-out;
	transition: all 0.8s;
}

.tree-container {
	position: relative;
	overflow: hidden;

	.vue-tree {
		position: relative;
	}

	> svg,
	.dom-container {
		width: 100%;
		height: 100%;
		position: absolute;
		left: 0;
		top: 0;
		overflow: visible;
		transform-origin: 0 50%;
	}

	.dom-container {
		z-index: 1;
		pointer-events: none;
	}
}

.node-slot {
	cursor: pointer;
	pointer-events: all;
	position: absolute;
	background-color: transparent;
	box-sizing: border-box;
	transform: translate(-50%, -50%);
	display: flex;
	align-items: center;
	justify-content: center;
	box-sizing: content-box;
	transition: all 0.8s;
	transition-timing-function: ease-in-out;
}
</style>
