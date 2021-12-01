export namespace VueTreeChart {
	export interface DataSet {
		data: any;
		children?: Array<DataSet>;
		value: string;

		dataIdList?: Array<string>;
		_key: string;
		_callapsed: boolean;
	}
	export type IPartialDataSet = {
		[P in keyof DataSet]?: DataSet[P];
	}
	export interface ILinkStyleIdMap {
		[key: string]: {
			[key: string]: string;
		}
	}
	export interface INode{
		data: DataSet;
		depth: number;
		height: number;
		parent: INode;
		x: number;
		y: number;
	}
	export interface ILinkData {
		source: INode;
		target: INode;
		style?: {[key:string]:string};
	}
}
