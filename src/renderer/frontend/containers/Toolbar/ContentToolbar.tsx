import React, { useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { KeyCombo } from '@blueprintjs/core';
import IconSet from 'components/Icons';
import { Tooltip } from '.';
import {
  ToolbarButton,
  ToolbarToggleButton,
  ToolbarMenuButton,
  Menu,
  MenuRadioItem,
} from 'components';
import { IFile } from '../../../entities/File';
import FileTags from '../../components/FileTag';
import { useContext } from 'react';
import StoreContext from '../../contexts/StoreContext';
import { FileRemoval } from 'src/renderer/frontend/components/RemovalAlert';
import Searchbar from '../ContentView/Searchbar';
import FileStore from '../../stores/FileStore';
import UiStore from '../../stores/UiStore';

interface IFileSelection {
  allFilesSelected: boolean;
  toggleSelection: () => void;
  selectionCount: number;
}

const FileSelection = observer(
  ({ allFilesSelected, toggleSelection: toggle, selectionCount }: IFileSelection) => (
    <ToolbarToggleButton
      showLabel="always"
      icon={allFilesSelected ? IconSet.SELECT_ALL_CHECKED : IconSet.SELECT_ALL}
      onClick={toggle}
      pressed={allFilesSelected}
      text={selectionCount}
      tooltip={Tooltip.Select}
    />
  ),
);

const RemoveFilesPopover = observer(() => {
  const { uiStore } = useContext(StoreContext);
  return (
    <>
      <ToolbarButton
        icon={IconSet.DELETE}
        disabled={uiStore.fileSelection.size === 0}
        onClick={uiStore.openToolbarFileRemover}
        text="Delete"
        tooltip={Tooltip.Delete}
        // Giving it a warning intent will make it stand out more - it is usually hidden so it might not be obviously discovered
        // intent="warning"
      />
      <FileRemoval
        onClose={uiStore.closeToolbarFileRemover}
        object={uiStore.isToolbarFileRemoverOpen ? uiStore.clientFileSelection : []}
      />
    </>
  );
});

const sortMenuData: Array<{ prop: keyof IFile; icon: JSX.Element; text: string }> = [
  // { prop: 'tags', icon: IconSet.TAG, text: 'Tag' },
  { prop: 'name', icon: IconSet.FILTER_NAME_UP, text: 'Name' },
  { prop: 'extension', icon: IconSet.FILTER_FILE_TYPE, text: 'File type' },
  { prop: 'size', icon: IconSet.FILTER_FILTER_DOWN, text: 'File size' },
  { prop: 'dateAdded', icon: IconSet.FILTER_DATE, text: 'Date added' },
  { prop: 'dateModified', icon: IconSet.FILTER_DATE, text: 'Date modified' },
];

export const SortMenuItems = observer(({ fileStore }: { fileStore: FileStore }) => {
  const { fileOrder, orderBy, orderFilesBy, switchFileOrder } = fileStore;
  const orderIcon = fileOrder === 'DESC' ? IconSet.ARROW_DOWN : IconSet.ARROW_UP;
  return (
    <>
      {sortMenuData.map(({ prop, icon, text }) => (
        <MenuRadioItem
          key={prop}
          icon={icon}
          text={text}
          checked={orderBy === prop}
          accelerator={orderBy === prop ? orderIcon : undefined}
          onClick={() => (orderBy === prop ? switchFileOrder() : orderFilesBy(prop))}
        />
      ))}
    </>
  );
});

export const LayoutMenuItems = observer(({ uiStore }: { uiStore: UiStore }) => (
  <>
    <MenuRadioItem
      icon={IconSet.VIEW_LIST}
      onClick={uiStore.setMethodList}
      checked={uiStore.isList}
      text="List View"
      accelerator={<KeyCombo minimal combo={uiStore.hotkeyMap.viewList} />}
    />
    <MenuRadioItem
      icon={IconSet.VIEW_GRID}
      onClick={uiStore.setMethodGrid}
      checked={uiStore.isGrid}
      text="Grid View"
      accelerator={<KeyCombo minimal combo={uiStore.hotkeyMap.viewGrid} />}
    />
  </>
));

const SlideModeToolbar = observer(() => {
  const { uiStore } = useContext(StoreContext);
  return (
    <ToolbarButton
      showLabel="always"
      icon={IconSet.ARROW_LEFT}
      onClick={uiStore.disableSlideMode}
      text="Return"
      tooltip={Tooltip.Back}
    />
  );
});

const ContentToolbar = observer(() => {
  const { uiStore, fileStore } = useContext(StoreContext);
  const { fileSelection } = uiStore;

  // If everything is selected, deselect all. Else, select all
  const handleToggleSelect = useCallback(
    () =>
      fileSelection.size > 0 && fileSelection.size === fileStore.fileList.length
        ? uiStore.clearFileSelection()
        : uiStore.selectAllFiles(),
    [fileSelection, fileStore.fileList, uiStore],
  );

  if (uiStore.isSlideMode) {
    return <SlideModeToolbar />;
  } else {
    return (
      <>
        <FileSelection
          allFilesSelected={
            fileSelection.size > 0 && fileSelection.size === fileStore.fileList.length
          }
          toggleSelection={handleToggleSelect}
          selectionCount={fileSelection.size}
        />

        {fileStore.content === 'missing' ? (
          // Only show option to remove selected files in toolbar when viewing missing files */}
          <RemoveFilesPopover />
        ) : (
          // Only show when not viewing missing files (so it is replaced by the Delete button)
          <FileTags files={fileSelection.size > 0 ? uiStore.clientFileSelection : []} />
        )}

        <ToolbarMenuButton
          icon={IconSet.FILTER}
          text="Filter"
          tooltip={Tooltip.Filter}
          id="__sort-menu"
          controls="__sort-options"
        >
          <Menu id="__sort-options" labelledby="__sort-menu" role="group">
            <SortMenuItems fileStore={fileStore} />
          </Menu>
        </ToolbarMenuButton>

        <ToolbarMenuButton
          icon={IconSet.THUMB_BG}
          text="View"
          tooltip={Tooltip.View}
          id="__layout-menu"
          controls="__layout-options"
        >
          <Menu id="__layout-options" labelledby="__layout-menu" role="group">
            <LayoutMenuItems uiStore={uiStore} />
          </Menu>
        </ToolbarMenuButton>

        <Searchbar />
      </>
    );
  }
});

export default ContentToolbar;
