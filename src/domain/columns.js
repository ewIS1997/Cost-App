export const COLUMN_DEFINITIONS = Object.freeze([
  ['boqCode','BOQ Code',true,false,128], ['resource','Resource',true,false,190], ['cqbi','CQBI',true,false,100], ['unit','Unit',true,false,100],
  ['cr','CR',true,false,90], ['rate','Rate',true,false,110], ['cost','Cost',false,true,120],
  ['override','Override',true,false,110], ['usedCost','Used Cost',false,true,125], ['boqQty','BOQ Qty',true,false,105],
  ['totalCost','Total Cost',false,true,145], ['remark','Remark',true,false,220],
].map(([key,label,editable,derived,defaultWidth], index) => Object.freeze({ index, letter:String.fromCharCode(65+index), key, label, editable, derived, defaultWidth })))
export const COLUMN_KEYS = Object.freeze(COLUMN_DEFINITIONS.map(({key}) => key))
export const EDITABLE_COLUMN_KEYS = Object.freeze(COLUMN_DEFINITIONS.filter(({editable}) => editable).map(({key}) => key))
export const isColumnKey = (key) => COLUMN_KEYS.includes(key)
export const isEditableColumnKey = (key) => EDITABLE_COLUMN_KEYS.includes(key)
