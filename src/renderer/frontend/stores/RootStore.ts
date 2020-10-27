import Backend from '../../backend/Backend';
import FileStore from './FileStore';
import TagStore from './TagStore';
import UiStore from './UiStore';
import LocationStore from './LocationStore';

import { configure } from 'mobx';
import { RendererMessenger } from 'src/Messaging';

// This will throw exceptions whenver we try to modify the state directly without an action
// Actions will batch state modifications -> better for performance
// https://mobx.js.org/refguide/action.html
configure({ observableRequiresReaction: true, reactionRequiresObservable: true });

/**
 * From: https://mobx.js.org/best/store.html
 * An often asked question is how to combine multiple stores without using singletons.
 * How will they know about each other?
 * An effective pattern is to create a RootStore that instantiates all stores,
 * and share references. The advantage of this pattern is:
 * 1. Simple to set up.
 * 2. Supports strong typing well.
 * 3. Makes complex unit tests easy as you just have to instantiate a root store.
 */
class RootStore {
  readonly tagStore: TagStore;
  readonly fileStore: FileStore;
  readonly locationStore: LocationStore;
  readonly uiStore: UiStore;
  readonly clearDatabase: () => Promise<void>;

  constructor(backend: Backend) {
    this.tagStore = new TagStore(backend, this);
    this.fileStore = new FileStore(backend, this);
    this.locationStore = new LocationStore(backend, this);
    this.uiStore = new UiStore(this);

    // SAFETY: The backend instance has the same lifetime as the RootStore.
    this.clearDatabase = async () => {
      await backend.clearDatabase();
      RendererMessenger.clearDatabase();
    };
  }

  async init(autoLoadFiles: boolean) {
    // The location store is not required to be finished with loading before showing the rest
    // So it does not need to be awaited
    this.locationStore.init(autoLoadFiles);
    await Promise.all([this.tagStore.init(), this.fileStore.init(autoLoadFiles)]);
    // Upon loading data, initialize UI state.
    this.uiStore.init();
  }
}

export default RootStore;
