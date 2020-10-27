import { computed, observable, action, makeObservable } from 'mobx';
import chokidar, { FSWatcher } from 'chokidar';
import fse from 'fs-extra';
import SysPath from 'path';

import { ID, IResource, ISerializable } from './ID';
import LocationStore from '../frontend/stores/LocationStore';
import { IMG_EXTENSIONS } from './File';
import { RECURSIVE_DIR_WATCH_DEPTH } from '../../config';
import { AppToaster } from '../frontend/App';
import { IconSet } from 'components/Icons';

export const DEFAULT_LOCATION_ID: ID = 'default-location';

export interface ILocation extends IResource {
  id: ID;
  path: string;
  dateAdded: Date;
}

export interface IDirectoryTreeItem {
  name: string;
  fullPath: string;
  children: IDirectoryTreeItem[];
}

/**
 * Recursive function that returns the dir list for a given path
 */
async function getDirectoryTree(path: string): Promise<IDirectoryTreeItem[]> {
  try {
    let dirs: string[] = [];
    for (const file of await fse.readdir(path)) {
      const fullPath = SysPath.join(path, file);
      if ((await fse.stat(fullPath)).isDirectory()) {
        dirs = [...dirs, fullPath];
      }
    }
    return Promise.all(
      dirs.map(
        async (dir): Promise<IDirectoryTreeItem> => ({
          name: SysPath.basename(dir),
          fullPath: dir,
          children: await getDirectoryTree(dir),
        }),
      ),
    );
  } catch (e) {
    return [];
  }
}

export class ClientLocation implements ISerializable<ILocation> {
  private store: LocationStore;

  private watcher?: FSWatcher;
  // Whether the initial scan has been completed, and new/removed files are being watched
  private isReady = false;
  // whether initialization has started or has been completed
  @observable isInitialized = false;
  // true when the path no longer exists (broken link)
  @observable isBroken = false;

  readonly id: ID;
  @observable path: string;
  readonly dateAdded: Date;

  constructor(store: LocationStore, id: ID, path: string, dateAdded: Date = new Date()) {
    this.store = store;
    this.id = id;
    this.path = path;
    this.dateAdded = dateAdded;

    makeObservable(this);
  }

  @computed get name(): string {
    return SysPath.basename(this.path);
  }

  @action.bound async init(cancel?: () => boolean): Promise<string[] | undefined> {
    this.isInitialized = true;
    const path = this.path;
    const pathExists = await fse.pathExists(path);
    if (pathExists) {
      return this.watchDirectory(path, cancel);
    } else {
      this.setBroken(true);
      return undefined;
    }
  }

  @action serialize(): ILocation {
    return {
      id: this.id,
      path: this.path,
      dateAdded: this.dateAdded,
    };
  }

  @action setPath(newPath: string): void {
    this.path = newPath;
  }

  @action setBroken(state: boolean): void {
    this.isBroken = state;
  }

  @action async getDirectoryTree(): Promise<IDirectoryTreeItem[]> {
    return getDirectoryTree(this.path);
  }

  async delete(): Promise<void> {
    return this.store.delete(this);
  }

  @action private watchDirectory(directory: string, cancel?: () => boolean): Promise<string[]> {
    // Watch for folder changes
    this.watcher = chokidar.watch(directory, {
      depth: RECURSIVE_DIR_WATCH_DEPTH,
      // Ignore dot files. Also dot folders?
      // Todo: Ignore everything but image files
      ignored: /(^|[\/\\])\../,
    });

    const watcher = this.watcher;

    // Make a list of all files in this directory, which will be returned when all subdirs have been traversed
    const initialFiles: string[] = [];

    // TODO: Maybe do this on a web worker? Could hang the app for large folders

    return new Promise<string[]>((resolve) => {
      watcher
        .on('add', async (path: string) => {
          if (cancel?.()) {
            console.log('Cancelling file watching');
            await watcher.close();
          }
          if (IMG_EXTENSIONS.some((ext) => SysPath.extname(path).endsWith(ext))) {
            // Todo: ignore dot files/dirs?
            if (this.isReady) {
              console.log(`File ${path} has been added after initialization`);
              // Add to backend
              this.store.addFile(path, this);
            } else {
              initialFiles.push(path);
            }
          }
        })
        .on('change', (path: string) => console.log(`File ${path} has been changed`))
        .on('unlink', (path: string) => {
          console.log(`Location "${this.name}": File ${path} has been removed.`);
          this.store.hideFile(path);
        })
        .on(
          'ready',
          action(() => {
            this.isReady = true;
            console.log(`Location "${this.name}" ready. Detected files:`, initialFiles.length);
            // Todo: Compare this in DB, add new files and mark missing files as missing
            resolve(initialFiles);
          }),
        )
        .on('error', (error: Error) => {
          console.error('Location watch error:', error);
          AppToaster.show(
            {
              message: `An error has occured while ${
                this.isReady ? 'watching' : 'initializing'
              } location "${this.name}".`,
              intent: 'danger',
              timeout: 0,
              action: {
                icon: IconSet.DELETE,
                onClick: () => this.delete(),
              },
            },
            'location-error',
          );
        });
    });
  }
}
