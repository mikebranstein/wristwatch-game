'use strict';
const { CollectionGallery } = require('./CollectionGallery');
class WorkshopHubNav {
  constructor({ saveState, onNavigation = null }) {
    this._saveState = saveState;
    this._onNavigation = onNavigation;
    this._gallery = new CollectionGallery({ saveState });
  }
  openCollectionGallery() {
    if (this._onNavigation) this._onNavigation('collection_gallery');
    return this._gallery.open();
  }
  closeCollectionGallery() {
    this._gallery.close();
    if (this._onNavigation) this._onNavigation('workshop_hub');
  }
  getHubNavViewModel() {
    return { buttons: [{ id: 'collection_gallery', label: 'Collection Gallery', enabled: true }] };
  }
  getGallery() { return this._gallery; }
}
module.exports = { WorkshopHubNav };