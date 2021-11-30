import { Column } from './column.interface';
import { SlickGrid } from './slickGrid.interface';

export interface MenuFromCellCallbackArgs {
  /** Grid cell/column index */
  cell: number;

  /** Grid row index */
  row: number;

  /** Reference to the grid. */
  grid: SlickGrid;
}

export interface MenuFromCellWithColumnCallbackArgs<T = any> extends MenuFromCellCallbackArgs {
  /** Cell Column definition */
  column?: Column<T>;
}