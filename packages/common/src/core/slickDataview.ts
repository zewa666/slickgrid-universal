import { type AnyFunction, extend, getFunctionDetails, isDefined } from '@slickgrid-universal/utils';

import { SlickGroupItemMetadataProvider } from '../extensions/slickGroupItemMetadataProvider.js';
import type {
  Aggregator,
  DataViewHints,
  Grouping,
  GroupingFormatterItem,
  ItemMetadata,
  ItemMetadataProvider,
  OnGroupCollapsedEventArgs,
  OnGroupExpandedEventArgs,
  OnRowCountChangedEventArgs,
  OnRowsChangedEventArgs,
  OnRowsOrCountChangedEventArgs,
  OnSelectedRowIdsChangedEventArgs,
  OnSetItemsCalledEventArgs,
  PagingInfo,
} from '../interfaces/index.js';
import type { CssStyleHash, CustomDataView } from '../interfaces/gridOption.interface.js';
import { type BasePubSub, SlickEvent, SlickEventData, SlickGroup, SlickGroupTotals, type SlickNonDataItem } from './slickCore.js';
import type { SlickGrid } from './slickGrid.js';

export interface DataViewOption {
  /**
   * Defaults to false, are we using inline filters?
   * Note: please use with great care as this will break built-in filters
   */
  inlineFilters: boolean;

  /** global override for all rows */
  globalItemMetadataProvider: ItemMetadataProvider | null;

  /** Optionally provide a GroupItemMetadataProvider in order to use Grouping/DraggableGrouping features */
  groupItemMetadataProvider: SlickGroupItemMetadataProvider | null;

  /**
   * defaults to false, option to use CSP Safe approach,
   * Note: it is an opt-in option because it is slightly slower (perf impact) when compared to the non-CSP safe approach.
   */
  useCSPSafeFilter: boolean;
}

export type FilterFn<T> = (item: T, args: any) => boolean;
export type FilterCspFn<T> = (item: T[], args: any) => T[];
export type FilterWithCspCachingFn<T> = (item: T[], args: any, filterCache: any[]) => T[];
export type DataIdType = number | string;
export type SlickDataItem = SlickNonDataItem | SlickGroup | SlickGroupTotals | any;
export type GroupGetterFn = (val: any) => string | number;

/**
 * A sample Model implementation.
 * Provides a filtered view of the underlying data.
 *
 * Relies on the data item having an "id" property uniquely identifying it.
 */
export class SlickDataView<TData extends SlickDataItem = any> implements CustomDataView {
  protected defaults: DataViewOption = {
    globalItemMetadataProvider: null,
    groupItemMetadataProvider: null,
    inlineFilters: false,
    useCSPSafeFilter: false,
  };

  // private
  protected idProperty = 'id'; // property holding a unique row id
  protected items: TData[] = []; // data by index
  protected rows: TData[] = []; // data by row
  protected idxById: Map<DataIdType, number> = new Map<DataIdType, number>(); // indexes by id
  protected rowsById: { [id: DataIdType]: number } | undefined = undefined; // rows by id; lazy-calculated
  protected filter: FilterFn<TData> | null = null; // filter function
  protected filterCSPSafe: FilterFn<TData> | null = null; // filter function
  protected updated: { [id: DataIdType]: boolean } | null = null; // updated item ids
  protected suspend = false; // suspends the recalculation
  protected isBulkSuspend = false; // delays protectedious operations like the
  // index update and delete to efficient
  // versions at endUpdate
  protected bulkDeleteIds: Map<DataIdType, boolean> = new Map<DataIdType, boolean>();
  protected sortAsc: boolean | undefined = true;
  protected sortComparer!: (a: TData, b: TData) => number;
  protected refreshHints: DataViewHints = {};
  protected prevRefreshHints: DataViewHints = {};
  protected filterArgs: any;
  protected filteredItems: TData[] = [];
  protected compiledFilter?: FilterFn<TData> | null;
  protected compiledFilterCSPSafe?: FilterCspFn<TData> | null;
  protected compiledFilterWithCaching?: FilterFn<TData> | null;
  protected compiledFilterWithCachingCSPSafe?: FilterWithCspCachingFn<TData> | null;
  protected filterCache: any[] = [];
  protected _grid?: SlickGrid; // grid object will be defined only after using "syncGridSelection()" method"

  // grouping
  protected groupingInfoDefaults: Grouping = {
    getter: undefined,
    formatter: undefined,
    comparer: (a: { value: any }, b: { value: any }) => (a.value === b.value ? 0 : a.value > b.value ? 1 : -1),
    predefinedValues: [],
    aggregators: [],
    aggregateEmpty: false,
    aggregateCollapsed: false,
    aggregateChildGroups: false,
    collapsed: false,
    displayTotalsRow: true,
    lazyTotalsCalculation: false,
  };
  protected groupingInfos: Array<
    Grouping & { aggregators: Aggregator[]; getterIsAFn?: boolean; compiledAccumulators: any[]; getter: GroupGetterFn | string }
  > = [];
  protected groups: SlickGroup[] = [];
  protected toggledGroupsByLevel: any[] = [];
  protected groupingDelimiter = ':|:';
  protected selectedRowIds: DataIdType[] = [];
  protected preSelectedRowIdsChangeFn?: (args?: any) => void;

  protected pagesize = 0;
  protected pagenum = 0;
  protected totalRows = 0;
  protected _options: DataViewOption;

  // public events
  onBeforePagingInfoChanged: SlickEvent<PagingInfo>;
  onGroupExpanded: SlickEvent<OnGroupExpandedEventArgs>;
  onGroupCollapsed: SlickEvent<OnGroupCollapsedEventArgs>;
  onPagingInfoChanged: SlickEvent<PagingInfo>;
  onRowCountChanged: SlickEvent<OnRowCountChangedEventArgs>;
  onRowsChanged: SlickEvent<OnRowsChangedEventArgs>;
  onRowsOrCountChanged: SlickEvent<OnRowsOrCountChangedEventArgs>;
  onSelectedRowIdsChanged: SlickEvent<OnSelectedRowIdsChangedEventArgs>;
  onSetItemsCalled: SlickEvent<OnSetItemsCalledEventArgs>;

  constructor(
    options?: Partial<DataViewOption> | undefined,
    protected externalPubSub?: BasePubSub | undefined
  ) {
    this.onBeforePagingInfoChanged = new SlickEvent<PagingInfo>('onBeforePagingInfoChanged', externalPubSub);
    this.onGroupExpanded = new SlickEvent<OnGroupExpandedEventArgs>('onGroupExpanded', externalPubSub);
    this.onGroupCollapsed = new SlickEvent<OnGroupCollapsedEventArgs>('onGroupCollapsed', externalPubSub);
    this.onPagingInfoChanged = new SlickEvent<PagingInfo>('onPagingInfoChanged', externalPubSub);
    this.onRowCountChanged = new SlickEvent<OnRowCountChangedEventArgs>('onRowCountChanged', externalPubSub);
    this.onRowsChanged = new SlickEvent<OnRowsChangedEventArgs>('onRowsChanged', externalPubSub);
    this.onRowsOrCountChanged = new SlickEvent<OnRowsOrCountChangedEventArgs>('onRowsOrCountChanged', externalPubSub);
    this.onSelectedRowIdsChanged = new SlickEvent<OnSelectedRowIdsChangedEventArgs>('onSelectedRowIdsChanged', externalPubSub);
    this.onSetItemsCalled = new SlickEvent<OnSetItemsCalledEventArgs>('onSetItemsCalled', externalPubSub);

    this._options = extend(true, {}, this.defaults, options);
  }

  /**
   * Begins a bached update of the items in the data view.
   * including deletes and the related events are postponed to the endUpdate call.
   * As certain operations are postponed during this update, some methods might not
   * deliver fully consistent information.
   * @param {Boolean} [bulkUpdate] - if set to true, most data view modifications
   */
  beginUpdate(bulkUpdate?: boolean): void {
    this.suspend = true;
    this.isBulkSuspend = bulkUpdate === true;
  }

  endUpdate(): void {
    const wasBulkSuspend = this.isBulkSuspend;
    this.isBulkSuspend = false;
    this.suspend = false;
    if (wasBulkSuspend) {
      this.processBulkDelete();
      this.ensureIdUniqueness();
    }
    this.refresh();
  }

  destroy(): void {
    this.items = [];
    this.idProperty = 'id';
    this.idxById = null as any;
    this.rowsById = null as any;
    this.filter = null as any;
    this.filterCSPSafe = null as any;
    this.updated = null as any;
    this.sortComparer = null as any;
    this.filterCache = [];
    this.filteredItems = [];
    this.compiledFilter = null;
    this.compiledFilterCSPSafe = null;
    this.compiledFilterWithCaching = null;
    this.compiledFilterWithCachingCSPSafe = null;
    if (this._grid) {
      this._grid.onSelectedRowsChanged?.unsubscribe();
      this._grid.onCellCssStylesChanged?.unsubscribe();
    }
    this.onRowsOrCountChanged?.unsubscribe();
  }

  /** provide some refresh hints as to what to rows needs refresh */
  setRefreshHints(hints: DataViewHints): void {
    this.refreshHints = hints;
  }

  /** get extra filter arguments of the filter method */
  getFilterArgs(): any {
    return this.filterArgs;
  }

  /** add extra filter arguments to the filter method */
  setFilterArgs(args: unknown): void {
    this.filterArgs = args;
  }

  /**
   * Processes all delete requests placed during bulk update
   * by recomputing the items and idxById members.
   */
  protected processBulkDelete(): void {
    if (!this.idxById) {
      return;
    }

    // the bulk update is processed by
    // recomputing the whole items array and the index lookup in one go.
    // this is done by placing the not-deleted items
    // from left to right into the array and shrink the array the the new
    // size afterwards.
    // see https://github.com/6pac/SlickGrid/issues/571 for further details.

    let id: DataIdType;
    let item;
    let newIdx = 0;
    for (let i = 0, l = this.items.length; i < l; i++) {
      item = this.items[i];
      id = item[this.idProperty as keyof TData] as DataIdType;
      if (id === undefined) {
        throw new Error(`[SlickGrid DataView] Each data element must implement a unique 'id' property`);
      }

      // if items have been marked as deleted we skip them for the new final items array
      // and we remove them from the lookup table.
      if (this.bulkDeleteIds.has(id)) {
        this.idxById.delete(id);
      } else {
        // for items which are not deleted, we add them to the
        // next free position in the array and register the index in the lookup.
        this.items[newIdx] = item;
        this.idxById.set(id, newIdx);
        ++newIdx;
      }
    }

    // here we shrink down the full item array to the ones actually
    // inserted in the cleanup loop above.
    this.items.length = newIdx;
    // and finally cleanup the deleted ids to start cleanly on the next update.
    this.bulkDeleteIds = new Map();
  }

  protected updateIdxById(startingIndex?: number): void {
    if (this.isBulkSuspend || !this.idxById) {
      // during bulk update we do not reorganize
      return;
    }
    startingIndex = startingIndex || 0;
    let id: DataIdType;
    for (let i = startingIndex, l = this.items.length; i < l; i++) {
      id = this.items[i][this.idProperty as keyof TData] as DataIdType;
      if (id === undefined) {
        throw new Error(`[SlickGrid DataView] Each data element must implement a unique 'id' property`);
      }
      this.idxById.set(id, i);
    }
  }

  protected ensureIdUniqueness(): void {
    if (this.isBulkSuspend || !this.idxById) {
      // during bulk update we do not reorganize
      return;
    }
    let id: DataIdType;
    for (let i = 0, l = this.items.length; i < l; i++) {
      id = this.items[i][this.idProperty as keyof TData] as DataIdType;
      if (id === undefined || this.idxById.get(id) !== i) {
        throw new Error(`[SlickGrid DataView] Each data element must implement a unique 'id' property`);
      }
    }
  }

  /** Get all DataView Items */
  getItems(): TData[] {
    return this.items;
  }

  /** Get the DataView Id property name to use (defaults to "Id" but could be customized to something else when instantiating the DataView) */
  getIdPropertyName(): string {
    return this.idProperty;
  }

  /**
   * Set the Items with a new Dataset and optionally pass a different Id property name
   * @param {Array<*>} data - array of data
   * @param {String} [objectIdProperty] - optional id property to use as primary id
   */
  setItems(data: TData[], objectIdProperty?: string): void {
    if (objectIdProperty !== undefined) {
      this.idProperty = objectIdProperty;
    }
    this.items = this.filteredItems = data;
    this.onSetItemsCalled.notify({ idProperty: this.idProperty, itemCount: this.items.length }, null, this);
    this.idxById = new Map();
    this.updateIdxById();
    this.ensureIdUniqueness();
    this.refresh();
  }

  /** Set Paging Options */
  setPagingOptions(args: Partial<PagingInfo>): void {
    if (this.onBeforePagingInfoChanged.notify(this.getPagingInfo(), null, this).getReturnValue() !== false) {
      if (isDefined(args.pageSize)) {
        this.pagesize = args.pageSize;
        this.pagenum = this.pagesize ? Math.min(this.pagenum, Math.max(0, Math.ceil(this.totalRows / this.pagesize) - 1)) : 0;
      }

      if (isDefined(args.pageNum)) {
        this.pagenum = Math.min(args.pageNum, Math.max(0, Math.ceil(this.totalRows / this.pagesize) - 1));
      }

      this.onPagingInfoChanged.notify(this.getPagingInfo(), null, this);

      this.refresh();
    }
  }

  /** Get Paging Options */
  getPagingInfo(): PagingInfo {
    const totalPages = this.pagesize ? Math.max(1, Math.ceil(this.totalRows / this.pagesize)) : 1;
    return {
      pageSize: this.pagesize,
      pageNum: this.pagenum,
      totalRows: this.totalRows,
      totalPages,
      dataView: this as SlickDataView,
    };
  }

  /** Sort Method to use by the DataView */
  sort(comparer: (a: TData, b: TData) => number, ascending?: boolean): void {
    this.sortAsc = ascending;
    this.sortComparer = comparer;
    if (ascending === false) {
      this.items.reverse();
    }
    this.items.sort(comparer);
    if (ascending === false) {
      this.items.reverse();
    }
    this.idxById = new Map();
    this.updateIdxById();
    this.refresh();
  }

  /** Re-Sort the dataset */
  reSort(): void {
    if (this.sortComparer) {
      this.sort(this.sortComparer, this.sortAsc);
    }
  }

  /** Get only the DataView filtered items */
  getFilteredItems<T extends TData>() {
    return this.filteredItems as T[];
  }

  /** Get the array length (count) of only the DataView filtered items */
  getFilteredItemCount(): number {
    return this.filteredItems.length;
  }

  /** Get current Filter used by the DataView */
  getFilter(): FilterFn<TData> | null {
    return this._options.useCSPSafeFilter ? this.filterCSPSafe : this.filter;
  }

  /**
   * Set a Filter that will be used by the DataView
   * @param {Function} fn - filter callback function
   */
  setFilter(filterFn: FilterFn<TData>): void {
    this.filterCSPSafe = filterFn;
    this.filter = filterFn;
    if (this._options.inlineFilters) {
      this.compiledFilterCSPSafe = this.compileFilterCSPSafe;
      this.compiledFilterWithCachingCSPSafe = this.compileFilterWithCachingCSPSafe;
      this.compiledFilter = this.compileFilter(this._options.useCSPSafeFilter);
      this.compiledFilterWithCaching = this.compileFilterWithCaching(this._options.useCSPSafeFilter);
    }
    this.refresh();
  }

  /** Get current Grouping info */
  getGrouping(): Grouping[] {
    return this.groupingInfos;
  }

  /** Set some Grouping */
  setGrouping(groupingInfo: Grouping | Grouping[]): void {
    if (!this._options.groupItemMetadataProvider) {
      this._options.groupItemMetadataProvider = new SlickGroupItemMetadataProvider();
    }

    this.groups = [];
    this.toggledGroupsByLevel = [];
    groupingInfo = groupingInfo || [];
    this.groupingInfos = (groupingInfo instanceof Array ? groupingInfo : [groupingInfo]) as any;

    for (let i = 0; i < this.groupingInfos.length; i++) {
      const gi = (this.groupingInfos[i] = extend(true, {}, this.groupingInfoDefaults, this.groupingInfos[i]));
      gi.getterIsAFn = typeof gi.getter === 'function';

      // pre-compile accumulator loops
      gi.compiledAccumulators = [];
      let idx = gi.aggregators.length;
      while (idx--) {
        gi.compiledAccumulators[idx] = this.compileAccumulatorLoopCSPSafe(gi.aggregators[idx]);
      }

      this.toggledGroupsByLevel[i] = {};
    }

    this.refresh();
  }

  /** Get an item in the DataView by its row index */
  getItemByIdx<T extends TData>(i: number): T {
    return this.items[i] as T;
  }

  /** Get row index in the DataView by its Id */
  getIdxById(id: DataIdType): number | undefined {
    return this.idxById?.get(id);
  }

  protected ensureRowsByIdCache(): void {
    if (!this.rowsById) {
      this.rowsById = {};
      for (let i = 0, l = this.rows.length; i < l; i++) {
        this.rowsById[this.rows[i][this.idProperty as keyof TData] as DataIdType] = i;
      }
    }
  }

  /** Get row number in the grid by its item object */
  getRowByItem(item: TData): number | undefined {
    this.ensureRowsByIdCache();
    return this.rowsById?.[item[this.idProperty as keyof TData] as DataIdType];
  }

  /** Get row number in the grid by its Id */
  getRowById(id: DataIdType): number | undefined {
    this.ensureRowsByIdCache();
    return this.rowsById?.[id];
  }

  /** Get an item in the DataView by its Id */
  getItemById<T extends TData>(id: DataIdType) {
    return this.items[this.idxById.get(id) as number] as T;
  }

  /** From the items array provided, return the mapped rows */
  mapItemsToRows(itemArray: TData[]): number[] {
    const rows: number[] = [];
    this.ensureRowsByIdCache();
    for (let i = 0, l = itemArray.length; i < l; i++) {
      const row = this.rowsById?.[itemArray[i][this.idProperty as keyof TData] as DataIdType];
      if (isDefined(row)) {
        rows[rows.length] = row as number;
      }
    }
    return rows;
  }

  /** From the Ids array provided, return the mapped rows */
  mapIdsToRows(idArray: DataIdType[]): number[] {
    const rows: number[] = [];
    this.ensureRowsByIdCache();
    for (let i = 0, l = idArray.length; i < l; i++) {
      const row = this.rowsById?.[idArray[i]];
      if (isDefined(row)) {
        rows[rows.length] = row as number;
      }
    }
    return rows;
  }

  /** From the rows array provided, return the mapped Ids */
  mapRowsToIds(rowArray: number[]): DataIdType[] {
    const ids: DataIdType[] = [];
    for (let i = 0, l = rowArray.length; i < l; i++) {
      if (rowArray[i] < this.rows.length) {
        const rowItem = this.rows[rowArray[i]];
        ids[ids.length] = rowItem![this.idProperty as keyof TData] as DataIdType;
      }
    }
    return ids;
  }

  /**
   * Performs the update operations of a single item by id without
   * triggering any events or refresh operations.
   * @param id The new id of the item.
   * @param item The item which should be the new value for the given id.
   */
  updateSingleItem(id: DataIdType, item: TData): void {
    if (!this.idxById) {
      return;
    }

    // see also https://github.com/mleibman/SlickGrid/issues/1082
    if (!this.idxById.has(id)) {
      throw new Error('[SlickGrid DataView] Invalid id');
    }

    // What if the specified item also has an updated idProperty?
    // Then we'll have to update the index as well, and possibly the `updated` cache too.
    if (id !== item[this.idProperty as keyof TData]) {
      // make sure the new id is unique:
      const newId = item[this.idProperty as keyof TData] as DataIdType;
      if (!isDefined(newId)) {
        throw new Error('[SlickGrid DataView] Cannot update item to associate with a null id');
      }
      if (this.idxById.has(newId)) {
        throw new Error('[SlickGrid DataView] Cannot update item to associate with a non-unique id');
      }
      this.idxById.set(newId, this.idxById.get(id) as number);
      this.idxById.delete(id);

      // Also update the `updated` hashtable/markercache? Yes, `recalc()` inside `refresh()` needs that one!
      if (this.updated?.[id]) {
        delete this.updated[id];
      }

      // Also update the row indexes? no need since the `refresh()`, further down, blows away the `rowsById[]` cache!
      id = newId;
    }
    this.items[this.idxById.get(id) as number] = item;

    // Also update the rows? no need since the `refresh()`, further down, blows away the `rows[]` cache and recalculates it via `recalc()`!
    if (!this.updated) {
      this.updated = {};
    }
    this.updated[id] = true;
  }

  /**
   * Updates a single item in the data view given the id and new value.
   * @param id The new id of the item.
   * @param item The item which should be the new value for the given id.
   */
  updateItem<T extends TData>(id: DataIdType, item: T): void {
    this.updateSingleItem(id, item);
    this.refresh();
  }

  /**
   * Updates multiple items in the data view given the new ids and new values.
   * @param id {Array} The array of new ids which is in the same order as the items.
   * @param newItems {Array} The new items that should be set in the data view for the given ids.
   */
  updateItems<T extends TData>(ids: DataIdType[], newItems: T[]): void {
    if (ids.length !== newItems.length) {
      throw new Error('[SlickGrid DataView] Mismatch on the length of ids and items provided to update');
    }
    for (let i = 0, l = newItems.length; i < l; i++) {
      this.updateSingleItem(ids[i], newItems[i]);
    }
    this.refresh();
  }

  /**
   * Inserts a single item into the data view at the given position.
   * @param insertBefore {Number} The 0-based index before which the item should be inserted.
   * @param item The item to insert.
   */
  insertItem(insertBefore: number, item: TData): void {
    this.items.splice(insertBefore, 0, item);
    this.updateIdxById(insertBefore);
    this.refresh();
  }

  /**
   * Inserts multiple items into the data view at the given position.
   * @param insertBefore {Number} The 0-based index before which the items should be inserted.
   * @param newItems {Array}  The items to insert.
   */
  insertItems(insertBefore: number, newItems: TData[]): void {
    // @ts-ignore
    Array.prototype.splice.apply(this.items, [insertBefore, 0].concat(newItems));
    this.updateIdxById(insertBefore);
    this.refresh();
  }

  /**
   * Adds a single item at the end of the data view.
   * @param item The item to add at the end.
   */
  addItem(item: TData): void {
    this.items.push(item);
    this.updateIdxById(this.items.length - 1);
    this.refresh();
  }

  /**
   * Adds multiple items at the end of the data view.
   * @param {Array} newItems The items to add at the end.
   */
  addItems(newItems: TData[]): void {
    this.items = this.items.concat(newItems);
    this.updateIdxById(this.items.length - newItems.length);
    this.refresh();
  }

  /**
   * Deletes a single item identified by the given id from the data view.
   * @param {String|Number} id The id identifying the object to delete.
   */
  deleteItem(id: DataIdType): void {
    if (!this.idxById) {
      return;
    }
    if (this.isBulkSuspend) {
      this.bulkDeleteIds.set(id, true);
    } else {
      const idx = this.idxById.get(id);
      if (idx === undefined) {
        throw new Error('[SlickGrid DataView] Invalid id');
      }
      this.idxById.delete(id);
      this.items.splice(idx, 1);
      this.updateIdxById(idx);
      this.refresh();
    }
  }

  /**
   * Deletes multiple item identified by the given ids from the data view.
   * @param {Array} ids The ids of the items to delete.
   */
  deleteItems(ids: DataIdType[]): void {
    if (ids.length === 0 || !this.idxById) {
      return;
    }

    if (this.isBulkSuspend) {
      for (let i = 0, l = ids.length; i < l; i++) {
        const id = ids[i];
        const idx = this.idxById.get(id);
        if (idx === undefined) {
          throw new Error('[SlickGrid DataView] Invalid id');
        }
        this.bulkDeleteIds.set(id, true);
      }
    } else {
      // collect all indexes
      const indexesToDelete: number[] = [];
      for (let i = 0, l = ids.length; i < l; i++) {
        const id = ids[i];
        const idx = this.idxById.get(id);
        if (idx === undefined) {
          throw new Error('[SlickGrid DataView] Invalid id');
        }
        this.idxById.delete(id);
        indexesToDelete.push(idx);
      }

      // Remove from back to front
      indexesToDelete.sort();
      for (let i = indexesToDelete.length - 1; i >= 0; --i) {
        this.items.splice(indexesToDelete[i], 1);
      }

      // update lookup from front to back
      this.updateIdxById(indexesToDelete[0]);
      this.refresh();
    }
  }

  /** Add an item in a sorted dataset (a Sort function must be defined) */
  sortedAddItem(item: TData): void {
    if (!this.sortComparer) {
      throw new Error('[SlickGrid DataView] sortedAddItem() requires a sort comparer, use sort()');
    }
    this.insertItem(this.sortedIndex(item), item);
  }

  /** Update an item in a sorted dataset (a Sort function must be defined) */
  sortedUpdateItem(id: string | number, item: TData): void {
    if (!this.idxById) {
      return;
    }
    if (!this.idxById.has(id) || id !== item[this.idProperty as keyof TData]) {
      throw new Error(`[SlickGrid DataView] Invalid or non-matching id ${id}`);
    }
    if (!this.sortComparer) {
      throw new Error('[SlickGrid DataView] sortedUpdateItem() requires a sort comparer, use sort()');
    }
    const oldItem = this.getItemById(id);
    if (this.sortComparer(oldItem, item) !== 0) {
      // item affects sorting -> must use sorted add
      this.deleteItem(id);
      this.sortedAddItem(item);
    } else {
      // update does not affect sorting -> regular update works fine
      this.updateItem(id, item);
    }
  }

  protected sortedIndex(searchItem: TData): number {
    let low = 0;
    let high = this.items.length;

    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.sortComparer(this.items[mid], searchItem) === -1) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }

  /** Get item count, that is the full dataset lenght of the DataView */
  getItemCount(): number {
    return this.items.length;
  }

  /** Get row count (rows displayed in current page which also exclude any filtered items) */
  getLength(): number {
    return this.rows.length;
  }

  /** Retrieve an item from the DataView at specific index */
  getItem<T extends TData>(i: number): T {
    const item = this.rows[i] as T;

    // if this is a group row, make sure totals are calculated and update the title
    if ((item as SlickGroup)?.__group && (item as SlickGroup).totals && !(item as SlickGroup).totals?.initialized) {
      const gi = this.groupingInfos[(item as SlickGroup).level];
      if (!gi.displayTotalsRow) {
        this.calculateTotals((item as SlickGroup).totals);
        (item as SlickGroup).title = gi.formatter ? gi.formatter(item as SlickGroup) : (item as SlickGroup).value;
      }
    }
    // if this is a totals row, make sure it's calculated
    else if ((item as SlickGroupTotals)?.__groupTotals && !(item as SlickGroupTotals).initialized) {
      this.calculateTotals(item as SlickGroupTotals);
    }

    return item;
  }

  getItemMetadata(row: number): ItemMetadata | null {
    const item = this.rows[row];
    if (item === undefined) {
      return null;
    }

    // global override for all regular rows
    if (this._options.globalItemMetadataProvider?.getRowMetadata) {
      return this._options.globalItemMetadataProvider.getRowMetadata(item, row);
    }

    // overrides for grouping rows
    if ((item as SlickGroup).__group && this._options.groupItemMetadataProvider?.getGroupRowMetadata) {
      return this._options.groupItemMetadataProvider.getGroupRowMetadata(item as GroupingFormatterItem, row);
    }

    // overrides for totals rows
    if ((item as SlickGroupTotals).__groupTotals && this._options.groupItemMetadataProvider?.getTotalsRowMetadata) {
      return this._options.groupItemMetadataProvider.getTotalsRowMetadata(item as { group: GroupingFormatterItem }, row);
    }

    return null;
  }

  protected expandCollapseAllGroups(level?: number, collapse?: boolean): void {
    if (!isDefined(level)) {
      for (let i = 0; i < this.groupingInfos.length; i++) {
        this.toggledGroupsByLevel[i] = {};
        this.groupingInfos[i].collapsed = collapse;

        if (collapse === true) {
          this.onGroupCollapsed.notify({ level: i, groupingKey: null });
        } else {
          this.onGroupExpanded.notify({ level: i, groupingKey: null });
        }
      }
    } else {
      this.toggledGroupsByLevel[level] = {};
      this.groupingInfos[level].collapsed = collapse;

      if (collapse === true) {
        this.onGroupCollapsed.notify({ level, groupingKey: null });
      } else {
        this.onGroupExpanded.notify({ level, groupingKey: null });
      }
    }
    this.refresh();
  }

  /**
   * @param {Number} [level] Optional level to collapse.  If not specified, applies to all levels.
   */
  collapseAllGroups(level?: number): void {
    this.expandCollapseAllGroups(level, true);
  }

  /**
   * @param {Number} [level] Optional level to expand.  If not specified, applies to all levels.
   */
  expandAllGroups(level?: number): void {
    this.expandCollapseAllGroups(level, false);
  }

  expandCollapseGroup(level: number, groupingKey: string, collapse?: boolean): void {
    if (this.toggledGroupsByLevel[level]) {
      // @ts-ignore
      this.toggledGroupsByLevel[level][groupingKey] = this.groupingInfos[level].collapsed ^ collapse;
    }
    this.refresh();
  }

  /**
   * @param varArgs Either a SlickGroup's "groupingKey" property, or a
   *     variable argument list of grouping values denoting a unique path to the row.  For
   *     example, calling collapseGroup('high', '10%') will collapse the '10%' subgroup of
   *     the 'high' group.
   */
  collapseGroup(...args: any): void {
    const calledArgs = Array.prototype.slice.call(args);
    const arg0 = calledArgs[0];
    let groupingKey: string;
    let level: number;

    if (args.length === 1 && arg0.indexOf(this.groupingDelimiter) !== -1) {
      groupingKey = arg0;
      level = arg0.split(this.groupingDelimiter).length - 1;
    } else {
      groupingKey = args.join(this.groupingDelimiter);
      level = args.length - 1;
    }

    this.expandCollapseGroup(level, groupingKey, true);
    this.onGroupCollapsed.notify({ level, groupingKey });
  }

  /**
   * @param varArgs Either a SlickGroup's "groupingKey" property, or a
   *     variable argument list of grouping values denoting a unique path to the row.  For
   *     example, calling expandGroup('high', '10%') will expand the '10%' subgroup of
   *     the 'high' group.
   */
  expandGroup(...args: any): void {
    const calledArgs = Array.prototype.slice.call(args);
    const arg0 = calledArgs[0];
    let groupingKey: string;
    let level: number;

    if (args.length === 1 && arg0.indexOf(this.groupingDelimiter) !== -1) {
      level = arg0.split(this.groupingDelimiter).length - 1;
      groupingKey = arg0;
    } else {
      level = args.length - 1;
      groupingKey = args.join(this.groupingDelimiter);
    }

    this.expandCollapseGroup(level, groupingKey, false);
    this.onGroupExpanded.notify({ level, groupingKey });
  }

  getGroups(): SlickGroup[] {
    return this.groups;
  }

  protected extractGroups(rows: any[], parentGroup?: SlickGroup): SlickGroup[] {
    let group: SlickGroup;
    let val: any;
    const groups: SlickGroup[] = [];
    const groupsByVal: any = {};
    let r;
    const level = parentGroup ? parentGroup.level + 1 : 0;
    const gi = this.groupingInfos[level];

    for (let i = 0, l = gi.predefinedValues?.length ?? 0; i < l; i++) {
      val = gi.predefinedValues?.[i];
      group = groupsByVal[val];
      if (!group) {
        group = new SlickGroup();
        group.value = val;
        group.level = level;
        group.groupingKey = (parentGroup ? parentGroup.groupingKey + this.groupingDelimiter : '') + val;
        groups[groups.length] = group;
        groupsByVal[val] = group;
      }
    }

    for (let i = 0, l = rows.length; i < l; i++) {
      r = rows[i];
      val = gi.getterIsAFn ? (gi.getter as GroupGetterFn)(r) : r[gi.getter as keyof TData];
      group = groupsByVal[val];
      if (!group) {
        group = new SlickGroup();
        group.value = val;
        group.level = level;
        group.groupingKey = (parentGroup ? parentGroup.groupingKey + this.groupingDelimiter : '') + val;
        groups[groups.length] = group;
        groupsByVal[val] = group;
      }

      group.rows[group.count++] = r;
    }

    if (level < this.groupingInfos.length - 1) {
      for (let i = 0; i < groups.length; i++) {
        group = groups[i];
        group.groups = this.extractGroups(group.rows, group);
      }
    }

    if (groups.length) {
      this.addTotals(groups, level);
    }

    groups.sort(this.groupingInfos[level].comparer);

    return groups;
  }

  /** claculate Group Totals */
  protected calculateTotals(totals: SlickGroupTotals): void {
    const group = totals.group as SlickGroup;
    const gi = this.groupingInfos[group?.level ?? 0];
    const isLeafLevel = group.level === this.groupingInfos.length;
    let agg: Aggregator;
    let idx = gi.aggregators.length;

    if (!isLeafLevel && gi.aggregateChildGroups) {
      // make sure all the subgroups are calculated
      let i = group.groups?.length ?? 0;
      while (i--) {
        if (!group.groups[i].totals.initialized) {
          this.calculateTotals(group.groups[i].totals);
        }
      }
    }

    while (idx--) {
      agg = gi.aggregators[idx];
      agg.init();
      if (!isLeafLevel && gi.aggregateChildGroups) {
        gi.compiledAccumulators[idx].call(agg, group.groups);
      } else {
        gi.compiledAccumulators[idx].call(agg, group.rows);
      }
      agg.storeResult(totals);
    }
    totals.initialized = true;
  }

  protected addGroupTotals(group: SlickGroup): void {
    const gi = this.groupingInfos[group.level];
    const totals = new SlickGroupTotals();
    totals.group = group;
    group.totals = totals;
    if (!gi.lazyTotalsCalculation) {
      this.calculateTotals(totals);
    }
  }

  protected addTotals(groups: SlickGroup[], level?: number): void {
    level = level || 0;
    const gi = this.groupingInfos[level];
    const groupCollapsed = gi.collapsed;
    const toggledGroups = this.toggledGroupsByLevel[level];
    let idx = groups.length;
    let g;
    while (idx--) {
      g = groups[idx];

      if (g.collapsed && !gi.aggregateCollapsed) {
        continue;
      }

      // Do a depth-first aggregation so that parent group aggregators can access subgroup totals.
      if (g.groups) {
        this.addTotals(g.groups, level + 1);
      }

      if (gi.aggregators?.length && (gi.aggregateEmpty || g.rows.length || g.groups?.length)) {
        this.addGroupTotals(g);
      }

      g.collapsed = (groupCollapsed as any) ^ toggledGroups[g.groupingKey];
      g.title = gi.formatter ? gi.formatter(g) : g.value;
    }
  }

  protected flattenGroupedRows(groups: SlickGroup[], level?: number): any[] {
    level = level || 0;
    const gi = this.groupingInfos[level];
    const groupedRows: any[] = [];
    let rows: any[];
    let gl = 0;
    let g;
    for (let i = 0, l = groups.length; i < l; i++) {
      g = groups[i];
      groupedRows[gl++] = g;

      if (!g.collapsed) {
        rows = g.groups ? this.flattenGroupedRows(g.groups, level + 1) : g.rows;
        for (let j = 0, jj = rows.length; j < jj; j++) {
          groupedRows[gl++] = rows[j];
        }
      }

      if (g.totals && gi.displayTotalsRow && (!g.collapsed || gi.aggregateCollapsed)) {
        groupedRows[gl++] = g.totals;
      }
    }
    return groupedRows;
  }

  protected compileAccumulatorLoopCSPSafe(aggregator: Aggregator): (items: any[]) => void {
    if (aggregator.accumulate) {
      return function (items: any[]) {
        let result;
        if (Array.isArray(items)) {
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            result = aggregator.accumulate!.call(aggregator, item);
          }
        }
        return result;
      };
    } else {
      return function noAccumulator() {};
    }
  }

  protected compileFilterCSPSafe(items: TData[], args: any): TData[] {
    /* v8 ignore next 3 */
    if (typeof this.filterCSPSafe !== 'function') {
      return [];
    }
    const retval: TData[] = [];
    const il = items.length;

    for (let _i = 0; _i < il; _i++) {
      if (this.filterCSPSafe(items[_i], args)) {
        retval.push(items[_i]);
      }
    }

    return retval;
  }

  protected compileFilter(stopRunningIfCSPSafeIsActive = false): FilterFn<TData> | null {
    if (stopRunningIfCSPSafeIsActive) {
      return null;
    }
    const filterInfo = getFunctionDetails(this.filter as FilterFn<TData>);

    const filterPath1 = '{ continue _coreloop; }$1';
    const filterPath2 = '{ _retval[_idx++] = $item$; continue _coreloop; }$1';
    // make some allowances for minification - there's only so far we can go with RegEx
    const filterBody = filterInfo.body
      .replace(/return false\s*([;}]|\}|$)/gi, filterPath1)
      .replace(/return!1([;}]|\}|$)/gi, filterPath1)
      .replace(/return true\s*([;}]|\}|$)/gi, filterPath2)
      .replace(/return!0([;}]|\}|$)/gi, filterPath2)
      .replace(/return ([^;}]+?)\s*([;}]|$)/gi, '{ if ($1) { _retval[_idx++] = $item$; }; continue _coreloop; }$2');

    // This preserves the function template code after JS compression,
    // so that replace() commands still work as expected.
    let tpl = [
      // 'function(_items, _args) { ',
      'var _retval = [], _idx = 0; ',
      'var $item$, $args$ = _args; ',
      '_coreloop: ',
      'for (var _i = 0, _il = _items.length; _i < _il; _i++) { ',
      '$item$ = _items[_i]; ',
      '$filter$; ',
      '} ',
      'return _retval; ',
      // '}'
    ].join('');
    tpl = tpl.replace(/\$filter\$/gi, filterBody);
    tpl = tpl.replace(/\$item\$/gi, filterInfo.params[0]);
    tpl = tpl.replace(/\$args\$/gi, filterInfo.params[1]);
    const fn: any = new Function('_items,_args', tpl);
    const fnName = 'compiledFilter';
    fn.displayName = fnName;
    fn.name = this.setFunctionName(fn, fnName);
    return fn;
  }

  protected compileFilterWithCaching(stopRunningIfCSPSafeIsActive = false): FilterFn<TData> | null {
    if (stopRunningIfCSPSafeIsActive) {
      return null;
    }

    const filterInfo = getFunctionDetails(this.filter as FilterFn<TData>);

    const filterPath1 = '{ continue _coreloop; }$1';
    const filterPath2 = '{ _cache[_i] = true;_retval[_idx++] = $item$; continue _coreloop; }$1';
    // make some allowances for minification - there's only so far we can go with RegEx
    const filterBody = filterInfo.body
      .replace(/return false\s*([;}]|\}|$)/gi, filterPath1)
      .replace(/return!1([;}]|\}|$)/gi, filterPath1)
      .replace(/return true\s*([;}]|\}|$)/gi, filterPath2)
      .replace(/return!0([;}]|\}|$)/gi, filterPath2)
      .replace(/return ([^;}]+?)\s*([;}]|$)/gi, '{ if ((_cache[_i] = $1)) { _retval[_idx++] = $item$; }; continue _coreloop; }$2');

    // This preserves the function template code after JS compression,
    // so that replace() commands still work as expected.
    let tpl = [
      // 'function(_items, _args, _cache) { ',
      'var _retval = [], _idx = 0; ',
      'var $item$, $args$ = _args; ',
      '_coreloop: ',
      'for (var _i = 0, _il = _items.length; _i < _il; _i++) { ',
      '$item$ = _items[_i]; ',
      'if (_cache[_i]) { ',
      '_retval[_idx++] = $item$; ',
      'continue _coreloop; ',
      '} ',
      '$filter$; ',
      '} ',
      'return _retval; ',
      // '}'
    ].join('');
    tpl = tpl.replace(/\$filter\$/gi, filterBody);
    tpl = tpl.replace(/\$item\$/gi, filterInfo.params[0]);
    tpl = tpl.replace(/\$args\$/gi, filterInfo.params[1]);

    const fn: any = new Function('_items,_args,_cache', tpl);
    const fnName = 'compiledFilterWithCaching';
    fn.displayName = fnName;
    fn.name = this.setFunctionName(fn, fnName);
    return fn;
  }

  protected compileFilterWithCachingCSPSafe(items: TData[], args: any, filterCache: any[]): TData[] {
    /* v8 ignore next 3 */
    if (typeof this.filterCSPSafe !== 'function') {
      return [];
    }

    const retval: TData[] = [];
    const il = items.length;

    for (let _i = 0; _i < il; _i++) {
      if (filterCache[_i] || this.filterCSPSafe(items[_i], args)) {
        retval.push(items[_i]);
      }
    }

    return retval;
  }

  /**
   * In ES5 we could set the function name on the fly but in ES6 this is forbidden and we need to set it through differently
   * We can use Object.defineProperty and set it the property to writable, see MDN for reference
   * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty
   * @param {*} fn
   * @param {string} fnName
   */
  protected setFunctionName(fn: any, fnName: string): void {
    try {
      Object.defineProperty(fn, 'name', { writable: true, value: fnName });
      /* v8 ignore next 3 */
    } catch (err) {
      fn.name = fnName;
    }
  }

  protected uncompiledFilter(items: TData[], args: any): any[] {
    const retval: any[] = [];
    let idx = 0;

    for (let i = 0, ii = items.length; i < ii; i++) {
      if (this.filter?.(items[i], args)) {
        retval[idx++] = items[i];
      }
    }

    return retval;
  }

  protected uncompiledFilterWithCaching(items: TData[], args: any, cache: any): any[] {
    const retval: any[] = [];
    let idx = 0;
    let item: TData;

    for (let i = 0, ii = items.length; i < ii; i++) {
      item = items[i];
      if (cache[i]) {
        retval[idx++] = item;
      } else if (this.filter?.(item, args)) {
        retval[idx++] = item;
        cache[i] = true;
      }
    }

    return retval;
  }

  protected getFilteredAndPagedItems(items: TData[]): { totalRows: number; rows: TData[] } {
    if (this._options.useCSPSafeFilter ? this.filterCSPSafe : this.filter) {
      let batchFilter: AnyFunction;
      let batchFilterWithCaching: AnyFunction;
      if (this._options.useCSPSafeFilter) {
        batchFilter = (this._options.inlineFilters ? this.compiledFilterCSPSafe : this.uncompiledFilter) as AnyFunction;
        batchFilterWithCaching = (
          this._options.inlineFilters ? this.compiledFilterWithCachingCSPSafe : this.uncompiledFilterWithCaching
        ) as AnyFunction;
      } else {
        batchFilter = (this._options.inlineFilters ? this.compiledFilter : this.uncompiledFilter) as AnyFunction;
        batchFilterWithCaching = (
          this._options.inlineFilters ? this.compiledFilterWithCaching : this.uncompiledFilterWithCaching
        ) as AnyFunction;
      }
      if (this.refreshHints.isFilterNarrowing) {
        this.filteredItems = batchFilter.call(this, this.filteredItems, this.filterArgs);
      } else if (this.refreshHints.isFilterExpanding) {
        this.filteredItems = batchFilterWithCaching.call(this, items, this.filterArgs, this.filterCache);
      } else if (!this.refreshHints.isFilterUnchanged) {
        this.filteredItems = batchFilter.call(this, items, this.filterArgs);
      }
    } else {
      // special case:  if not filtering and not paging, the resulting
      // rows collection needs to be a copy so that changes due to sort
      // can be caught
      this.filteredItems = this.pagesize ? items : items.concat();
    }

    // get the current page
    let paged: TData[];
    if (this.pagesize) {
      if (this.filteredItems.length <= this.pagenum * this.pagesize) {
        if (this.filteredItems.length === 0) {
          this.pagenum = 0;
        } else {
          this.pagenum = Math.floor((this.filteredItems.length - 1) / this.pagesize);
        }
      }
      paged = this.filteredItems.slice(this.pagesize * this.pagenum, this.pagesize * this.pagenum + this.pagesize);
    } else {
      paged = this.filteredItems;
    }
    return { totalRows: this.filteredItems.length, rows: paged };
  }

  protected getRowDiffs(rows: TData[], newRows: TData[]): number[] {
    let item: TData | SlickNonDataItem | SlickDataItem | SlickGroup;
    let r;
    let eitherIsNonData;
    const diff: number[] = [];
    let from = 0;
    let to = Math.max(newRows.length, rows.length);

    if (this.refreshHints?.ignoreDiffsBefore) {
      from = Math.max(0, Math.min(newRows.length, this.refreshHints.ignoreDiffsBefore));
    }

    if (this.refreshHints?.ignoreDiffsAfter) {
      to = Math.min(newRows.length, Math.max(0, this.refreshHints.ignoreDiffsAfter));
    }

    for (let i = from, rl = rows.length; i < to; i++) {
      if (i >= rl) {
        diff[diff.length] = i;
      } else {
        item = newRows[i];
        r = rows[i];

        if (
          !item ||
          (this.groupingInfos.length &&
            (eitherIsNonData = (item as SlickNonDataItem).__nonDataRow || (r as SlickNonDataItem).__nonDataRow) &&
            (item as SlickGroup).__group !== (r as SlickGroup).__group) ||
          ((item as SlickGroup).__group && !(item as SlickGroup).equals(r as SlickGroup)) ||
          (eitherIsNonData &&
            // no good way to compare totals since they are arbitrary DTOs
            // deep object comparison is pretty expensive
            // always considering them 'dirty' seems easier for the time being
            ((item as SlickGroupTotals).__groupTotals || (r as SlickGroupTotals).__groupTotals)) ||
          item[this.idProperty as keyof TData] !== r[this.idProperty as keyof TData] ||
          this.updated?.[item[this.idProperty as keyof TData]]
        ) {
          diff[diff.length] = i;
        }
      }
    }
    return diff;
  }

  protected recalc(_items: TData[]): number[] {
    this.rowsById = undefined;

    if (
      this.refreshHints.isFilterNarrowing !== this.prevRefreshHints.isFilterNarrowing ||
      this.refreshHints.isFilterExpanding !== this.prevRefreshHints.isFilterExpanding
    ) {
      this.filterCache = [];
    }

    const filteredItems = this.getFilteredAndPagedItems(_items);
    this.totalRows = filteredItems.totalRows;
    let newRows: TData[] = filteredItems.rows;

    this.groups = [];
    if (this.groupingInfos.length) {
      this.groups = this.extractGroups(newRows);
      if (this.groups.length) {
        newRows = this.flattenGroupedRows(this.groups);
      }
    }

    const diff = this.getRowDiffs(this.rows, newRows as TData[]);

    this.rows = newRows as TData[];

    return diff;
  }

  refresh(): void {
    if (this.suspend) {
      return;
    }

    const previousPagingInfo = extend(true, {}, this.getPagingInfo());

    const countBefore = this.rows.length;
    const totalRowsBefore = this.totalRows;

    let diff = this.recalc(this.items); // pass as direct refs to avoid closure perf hit

    // if the current page is no longer valid, go to last page and recalc
    // we suffer a performance penalty here, but the main loop (recalc) remains highly optimized
    /* v8 ignore next 4 - not sure how this could occur */
    if (this.pagesize && this.totalRows < this.pagenum * this.pagesize) {
      this.pagenum = Math.max(0, Math.ceil(this.totalRows / this.pagesize) - 1);
      diff = this.recalc(this.items);
    }

    this.updated = null;
    this.prevRefreshHints = this.refreshHints;
    this.refreshHints = {};

    if (totalRowsBefore !== this.totalRows) {
      // use the previously saved paging info
      if (this.onBeforePagingInfoChanged.notify(previousPagingInfo, null, this).getReturnValue() !== false) {
        this.onPagingInfoChanged.notify(this.getPagingInfo(), null, this);
      }
    }
    if (countBefore !== this.rows.length) {
      this.onRowCountChanged.notify(
        {
          previous: countBefore,
          current: this.rows.length,
          itemCount: this.items.length,
          dataView: this,
          callingOnRowsChanged: diff.length > 0,
        },
        null,
        this
      );
    }
    if (diff.length > 0) {
      this.onRowsChanged.notify(
        { rows: diff, itemCount: this.items.length, dataView: this, calledOnRowCountChanged: countBefore !== this.rows.length },
        null,
        this
      );
    }
    if (countBefore !== this.rows.length || diff.length > 0) {
      this.onRowsOrCountChanged.notify(
        {
          rowsDiff: diff,
          previousRowCount: countBefore,
          currentRowCount: this.rows.length,
          itemCount: this.items.length,
          rowCountChanged: countBefore !== this.rows.length,
          rowsChanged: diff.length > 0,
          dataView: this,
        },
        null,
        this
      );
    }
  }

  /**
   * Wires the grid and the DataView together to keep row selection tied to item ids.
   * This is useful since, without it, the grid only knows about rows, so if the items
   * move around, the same rows stay selected instead of the selection moving along
   * with the items.
   *
   * NOTE:  This doesn't work with cell selection model.
   *
   * @param {SlickGrid} grid - The grid to sync selection with.
   * @param {Boolean} preserveHidden - Whether to keep selected items that go out of the
   *     view due to them getting filtered out. When used with pagination,
   *     changing selection on different page will cancel previous page selection
   * @param {Boolean} [preserveHiddenOnSelectionChange] - Whether to keep selected items
   *     that are currently out of the view (see preserveHidden) as selected when selection
   *     changes. When used with pagination, changing selection on different page
   *     will keep previous page selection (this is different compared to `preserveHidden`)
   * @return {Event} An event that notifies when an internal list of selected row ids
   *     changes.  This is useful since, in combination with the above two options, it allows
   *     access to the full list selected row ids, and not just the ones visible to the grid.
   * @method syncGridSelection
   */
  syncGridSelection(
    grid: SlickGrid,
    preserveHidden: boolean,
    preserveHiddenOnSelectionChange?: boolean
  ): SlickEvent<OnSelectedRowIdsChangedEventArgs> {
    this._grid = grid;
    let inHandler: boolean;
    this.selectedRowIds = this.mapRowsToIds(grid.getSelectedRows());
    const gridOptions = grid.getOptions();

    /** @param {Array} rowIds */
    const setSelectedRowIds = (rowIds: DataIdType[] | false) => {
      /* v8 ignore next 3 */
      if (rowIds === false) {
        this.selectedRowIds = [];
      } else {
        if (this.selectedRowIds!.sort().join(',') !== rowIds.sort().join(',')) {
          this.selectedRowIds = rowIds;
        }
      }
    };

    const update = () => {
      if ((this.selectedRowIds || []).length > 0 && !inHandler) {
        inHandler = true;
        const selectedRows = this.mapIdsToRows(this.selectedRowIds || []);
        if (!preserveHidden) {
          const selectedRowsChangedArgs = {
            grid: this._grid,
            ids: this.mapRowsToIds(selectedRows),
            rows: selectedRows,
            dataView: this,
          };
          this.preSelectedRowIdsChangeFn!(selectedRowsChangedArgs);
          this.onSelectedRowIdsChanged.notify(
            Object.assign(selectedRowsChangedArgs, {
              selectedRowIds: this.selectedRowIds,
              filteredIds: this.getAllSelectedFilteredIds() as DataIdType[],
            }),
            new SlickEventData(),
            this
          );
        }
        grid.setSelectedRows(selectedRows);
        inHandler = false;
      }
    };

    grid.onSelectedRowsChanged.subscribe((_e, args) => {
      if (!inHandler) {
        const newSelectedRowIds = this.mapRowsToIds(args.rows);
        const selectedRowsChangedArgs = {
          grid: this._grid,
          ids: newSelectedRowIds,
          rows: args.rows,
          added: true,
          dataView: this,
        };
        this.preSelectedRowIdsChangeFn!(selectedRowsChangedArgs);
        this.onSelectedRowIdsChanged.notify(
          Object.assign(selectedRowsChangedArgs, {
            selectedRowIds: this.selectedRowIds,
            filteredIds: this.getAllSelectedFilteredIds() as DataIdType[],
          }),
          new SlickEventData(),
          this
        );
      }
    });

    this.preSelectedRowIdsChangeFn = (args: { ids: DataIdType[]; added?: boolean }) => {
      if (!inHandler) {
        inHandler = true;
        const overwrite = typeof args.added === 'undefined';

        /* v8 ignore next 3 */
        if (overwrite) {
          setSelectedRowIds(args.ids);
        } else {
          let rowIds: DataIdType[];
          if (args.added) {
            if (preserveHiddenOnSelectionChange && gridOptions.multiSelect) {
              // find the ones that are hidden
              const hiddenSelectedRowIds = this.selectedRowIds?.filter((id) => this.getRowById(id) === undefined);
              // add the newly selected ones
              rowIds = hiddenSelectedRowIds!.concat(args.ids);
            } else {
              rowIds = args.ids;
            }
          } else {
            if (preserveHiddenOnSelectionChange && gridOptions.multiSelect) {
              // remove rows whose id is on the list
              const argsIdsSet = new Set(args.ids);
              rowIds = this.selectedRowIds?.filter((id) => !argsIdsSet.has(id));
            } else {
              rowIds = [];
            }
          }
          setSelectedRowIds(rowIds);
        }
        inHandler = false;
      }
    };

    this.onRowsOrCountChanged.subscribe(update.bind(this));

    return this.onSelectedRowIdsChanged;
  }

  /**
   * Get all selected IDs
   * Note: when using Pagination it will also include hidden selections assuming `preserveHiddenOnSelectionChange` is set to true.
   */
  getAllSelectedIds(): DataIdType[] {
    return this.selectedRowIds;
  }

  /**
   * Get all selected filtered IDs (similar to "getAllSelectedIds" but only return filtered data)
   * Note: when using Pagination it will also include hidden selections assuming `preserveHiddenOnSelectionChange` is set to true.
   */
  getAllSelectedFilteredIds(): TData[keyof TData][] {
    return this.getAllSelectedFilteredItems().map((item) => item[this.idProperty as keyof TData]);
  }

  /**
   * Set current row selected IDs array (regardless of Pagination)
   * NOTE: This will NOT change the selection in the grid, if you need to do that then you still need to call
   * "grid.setSelectedRows(rows)"
   * @param {Array} selectedIds - list of IDs which have been selected for this action
   * @param {Object} options
   *  - `isRowBeingAdded`: defaults to true, are the new selected IDs being added (or removed) as new row selections
   *  - `shouldTriggerEvent`: defaults to true, should we trigger `onSelectedRowIdsChanged` event
   *  - `applyRowSelectionToGrid`: defaults to true, should we apply the row selections to the grid in the UI
   */
  setSelectedIds(
    selectedIds: Array<number | string>,
    options?: Partial<{ isRowBeingAdded: boolean; shouldTriggerEvent: boolean; applyRowSelectionToGrid: boolean }>
  ): void {
    let isRowBeingAdded = options?.isRowBeingAdded;
    const shouldTriggerEvent = options?.shouldTriggerEvent;
    const applyRowSelectionToGrid = options?.applyRowSelectionToGrid;

    if (isRowBeingAdded !== false) {
      isRowBeingAdded = true;
    }
    const selectedRows = this.mapIdsToRows(selectedIds);
    const selectedRowsChangedArgs = {
      grid: this._grid,
      ids: selectedIds,
      rows: selectedRows,
      added: isRowBeingAdded,
      dataView: this,
    };
    this.preSelectedRowIdsChangeFn?.(selectedRowsChangedArgs);

    if (shouldTriggerEvent !== false) {
      this.onSelectedRowIdsChanged.notify(
        Object.assign(selectedRowsChangedArgs, {
          selectedRowIds: this.selectedRowIds,
          filteredIds: this.getAllSelectedFilteredIds() as DataIdType[],
        }),
        new SlickEventData(),
        this
      );
    }

    // should we also apply the row selection in to the grid (UI) as well?
    if (applyRowSelectionToGrid !== false && this._grid) {
      this._grid.setSelectedRows(selectedRows);
    }
  }

  /**
   * Get all selected dataContext items
   * Note: when using Pagination it will also include hidden selections assuming `preserveHiddenOnSelectionChange` is set to true.
   */
  getAllSelectedItems<T extends TData>(): T[] {
    const selectedData: TData[] = [];
    const selectedIds = this.getAllSelectedIds();
    selectedIds!.forEach((id) => {
      selectedData.push(this.getItemById(id));
    });
    return selectedData as T[];
  }

  /**
   * Get all selected filtered dataContext items (similar to "getAllSelectedItems" but only return filtered data)
   * Note: when using Pagination it will also include hidden selections assuming `preserveHiddenOnSelectionChange` is set to true.
   */
  getAllSelectedFilteredItems<T extends TData>(): T[] {
    /* v8 ignore next 3 */
    if (!Array.isArray(this.selectedRowIds)) {
      return [];
    }

    const selectedRowIdSet = new Set<DataIdType>(this.selectedRowIds);
    const intersection = this.filteredItems.filter((a) => selectedRowIdSet.has(a[this.idProperty as keyof TData] as DataIdType));
    return (intersection || []) as T[];
  }

  syncGridCellCssStyles(grid: SlickGrid, key: string): void {
    let hashById: any;
    let inHandler: boolean;

    const storeCellCssStyles = (hash: CssStyleHash) => {
      hashById = {};
      if (typeof hash === 'object') {
        Object.keys(hash).forEach((row) => {
          if (hash && this.rows[row as any]) {
            const id = this.rows[row as any][this.idProperty as keyof TData];
            hashById[id] = hash[row];
          }
        });
      }
    };

    // since this method can be called after the cell styles have been set,
    // get the existing ones right away
    storeCellCssStyles(grid.getCellCssStyles(key));

    const update = () => {
      if (typeof hashById === 'object') {
        inHandler = true;
        this.ensureRowsByIdCache();
        const newHash: CssStyleHash = {};
        Object.keys(hashById).forEach((id) => {
          const row = this.rowsById?.[id];
          if (isDefined(row)) {
            newHash[row as number] = hashById[id];
          }
        });
        grid.setCellCssStyles(key, newHash);
        inHandler = false;
      }
    };

    grid.onCellCssStylesChanged.subscribe((_e, args) => {
      if (inHandler || key !== args.key) {
        return;
      }
      if (args.hash) {
        storeCellCssStyles(args.hash);
      } else {
        grid.onCellCssStylesChanged.unsubscribe();
        this.onRowsOrCountChanged.unsubscribe(update);
      }
    });

    this.onRowsOrCountChanged.subscribe(update.bind(this));
  }
}
