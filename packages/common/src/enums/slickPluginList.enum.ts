import {
  SlickCellExternalCopyManager,
  SlickCellMenu,
  SlickCellRangeDecorator,
  SlickCellRangeSelector,
  SlickCellSelectionModel,
  SlickCheckboxSelectColumn,
  SlickContextMenu,
  SlickDraggableGrouping,
  SlickEditorLock,
  SlickGroupItemMetadataProvider,
  SlickHeaderButtons,
  SlickHeaderMenu,
  SlickRowDetailView,
  SlickRowMoveManager,
  SlickRowSelectionModel,
} from '../interfaces/index';
import { AutoTooltipPlugin } from '../plugins/index';

export type SlickPluginList =
  AutoTooltipPlugin |
  SlickCellExternalCopyManager |
  SlickCellMenu |
  SlickCellRangeDecorator |
  SlickCellRangeSelector |
  SlickCellSelectionModel |
  SlickCheckboxSelectColumn |
  SlickContextMenu |
  SlickDraggableGrouping |
  SlickEditorLock |
  SlickGroupItemMetadataProvider |
  SlickHeaderButtons |
  SlickHeaderMenu |
  SlickRowDetailView |
  SlickRowMoveManager |
  SlickRowSelectionModel;
