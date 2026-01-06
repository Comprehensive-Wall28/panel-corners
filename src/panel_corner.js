import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GObject from 'gi://GObject';
import Cairo from 'cairo';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Utils from './utils.js';
import { debounce } from './utils.js';
import { ANIMATION_TIME } from 'resource:///org/gnome/shell/ui/overview.js';

// Debounce delay in milliseconds for settings changes
const SETTINGS_DEBOUNCE_MS = 50;

const SYNC_CREATE = GObject.BindingFlags.SYNC_CREATE;

export class PanelCorners {
    #settings;
    #connections;
    #debouncedStyleUpdate;

    constructor(settings, connections) {
        this.#settings = settings;
        this.#connections = connections;
        this.#debouncedStyleUpdate = null;
    }

    /**
     * Updates the corners.
     *
     * This removes already existing corners (previously created by the
     * extension, or from the shell itself), and create new ones.
     */
    update() {
        this.#log("updating panel corners...");

        // remove already existing corners
        this.remove();

        // create each corner
        Main.panel._leftCorner = new PanelCorner(
            St.Side.LEFT, this.#settings
        );
        Main.panel._rightCorner = new PanelCorner(
            St.Side.RIGHT, this.#settings
        );

        // update each of them
        this.update_corner(Main.panel._leftCorner);
        this.update_corner(Main.panel._rightCorner);

        this.#log("corners updated.");
    }

    /**
     * Updates the given corner.
     */
    update_corner(corner) {
        // bind corner style to the panel style
        Main.panel.bind_property('style', corner, 'style', SYNC_CREATE);

        // add corner to the panel
        Main.panel.add_child(corner);

        // update its style, showing it
        corner.vfunc_style_changed();

        const actor = (this.#settings.settings);

        // Create a debounced handler for settings changes
        // This prevents multiple rapid updates when settings change
        this.#debouncedStyleUpdate = debounce(() => {
            corner.invalidateCache();
            corner.vfunc_style_changed();
        }, SETTINGS_DEBOUNCE_MS);

        // connect to each preference change from the extension, allowing the
        // corner to be updated when the user changes preferences
        this.#settings.keys.forEach(key => {
            this.#connections.connect(
                actor,
                'changed::' + key.name,
                this.#debouncedStyleUpdate
            );
        });
    }

    /**
     * Removes existing corners.
     *
     * It is meant to destroy entirely old corners, except if they were saved
     * by the extension on load; in which case it keep them intact to restore
     * them on extension disable.
     */
    remove() {
        // cancel any pending debounced updates
        if (this.#debouncedStyleUpdate) {
            this.#debouncedStyleUpdate.cancel();
            this.#debouncedStyleUpdate = null;
        }

        // disconnect every signal created by the extension
        this.#connections.disconnect_all();

        let panel = Main.panel;

        // disable each corner

        if (panel._leftCorner) {
            this.remove_corner(panel._leftCorner);
            delete panel._leftCorner;
        }

        if (panel._rightCorner) {
            this.remove_corner(panel._rightCorner);
            delete panel._rightCorner;
        }
    }

    /**
     * Removes the given corner.
     */
    remove_corner(corner) {
        // remove connections
        corner.remove_connections();

        // remove from panel
        Main.panel.remove_child(corner);

        // destroy the corner
        corner.destroy();
    }

    #log(str) {
        if (this.#settings.DEBUG.get())
            console.log(`[Panel corners] ${str}`);
    }
}


export class PanelCorner extends St.DrawingArea {
    static {
        GObject.registerClass(this);
    }

    #side;
    #settings;
    #position_changed_id;
    #size_changed_id;

    // Cached computed values
    #cachedRadius = null;
    #cachedBorderWidth = null;
    #cachedBackgroundColor = null;
    #cachedOpacity = null;

    constructor(side, settings) {
        super({ style_class: 'panel-corner' });

        this.#side = side;
        this.#settings = settings;

        // Connect signals in constructor to ensure proper initialization order
        this.#position_changed_id = Main.panel.connect(
            'notify::position',
            this.#update_allocation.bind(this)
        );

        this.#size_changed_id = Main.panel.connect(
            'notify::size',
            this.#update_allocation.bind(this)
        );

        this.#update_allocation();
    }

    /**
     * Invalidates all cached values, forcing recalculation on next access.
     */
    invalidateCache() {
        this.#cachedRadius = null;
        this.#cachedBorderWidth = null;
        this.#cachedBackgroundColor = null;
        this.#cachedOpacity = null;
    }

    /**
     * Gets the corner radius, using cached value if available.
     */
    #getRadius(node) {
        if (this.#cachedRadius === null) {
            this.#cachedRadius = Utils.lookup_for_length(node, '-panel-corner-radius', this.#settings);
        }
        return this.#cachedRadius;
    }

    /**
     * Gets the border width, using cached value if available.
     */
    #getBorderWidth(node) {
        if (this.#cachedBorderWidth === null) {
            this.#cachedBorderWidth = Utils.lookup_for_length(node, '-panel-corner-border-width', this.#settings);
        }
        return this.#cachedBorderWidth;
    }

    /**
     * Gets the background color, using cached value if available.
     */
    #getBackgroundColor(node) {
        if (this.#cachedBackgroundColor === null) {
            this.#cachedBackgroundColor = Utils.lookup_for_color(node, '-panel-corner-background-color', this.#settings);
        }
        return this.#cachedBackgroundColor;
    }

    /**
     * Gets the opacity, using cached value if available.
     */
    #getOpacity(node) {
        if (this.#cachedOpacity === null) {
            this.#cachedOpacity = Utils.lookup_for_double(node, '-panel-corner-opacity', this.#settings);
        }
        return this.#cachedOpacity;
    }

    remove_connections() {
        if (this.#position_changed_id) {
            Main.panel.disconnect(this.#position_changed_id);
            this.#position_changed_id = null;
        }
        if (this.#size_changed_id) {
            Main.panel.disconnect(this.#size_changed_id);
            this.#size_changed_id = null;
        }
    }

    #update_allocation() {
        let childBox = new Clutter.ActorBox();

        let cornerWidth, cornerHeight;
        [, cornerWidth] = this.get_preferred_width(-1);
        [, cornerHeight] = this.get_preferred_height(-1);

        let allocWidth = Main.panel.width;
        let allocHeight = Main.panel.height;

        switch (this.#side) {
            case St.Side.LEFT:
                childBox.x1 = 0;
                childBox.x2 = cornerWidth;
                childBox.y1 = allocHeight;
                childBox.y2 = allocHeight + cornerHeight;
                break;

            case St.Side.RIGHT:
                childBox.x1 = allocWidth - cornerWidth;
                childBox.x2 = allocWidth;
                childBox.y1 = allocHeight;
                childBox.y2 = allocHeight + cornerHeight;
                break;
        }

        this.allocate(childBox);
    }

    vfunc_repaint() {
        let node = this.get_theme_node();

        // Use cached values for better performance
        let cornerRadius = this.#getRadius(node);
        let borderWidth = this.#getBorderWidth(node);
        let backgroundColor = this.#getBackgroundColor(node);

        let cr = this.get_context();
        cr.setOperator(Cairo.Operator.SOURCE);

        cr.moveTo(0, 0);
        if (this.#side == St.Side.LEFT) {
            cr.arc(cornerRadius,
                borderWidth + cornerRadius,
                cornerRadius, Math.PI, 3 * Math.PI / 2);
        } else {
            cr.arc(0,
                borderWidth + cornerRadius,
                cornerRadius, 3 * Math.PI / 2, 2 * Math.PI);
        }
        cr.lineTo(cornerRadius, 0);
        cr.closePath();

        cr.setSourceColor(backgroundColor);
        cr.fill();

        cr.$dispose();
    }

    vfunc_style_changed() {
        super.vfunc_style_changed();

        // Invalidate cache when style changes (theme changes, not settings)
        this.invalidateCache();

        let node = this.get_theme_node();

        // Use cached getters which will recalculate after invalidation
        let cornerRadius = this.#getRadius(node);
        let borderWidth = this.#getBorderWidth(node);
        let opacity = this.#getOpacity(node);

        // if using extension values and in overview, set transparent
        if (
            this.#settings.FORCE_EXTENSION_VALUES.get() &&
            Main.panel.get_style_pseudo_class() &&
            Main.panel.get_style_pseudo_class().includes('overview')
        )
            opacity = 0.;

        this.#update_allocation();
        this.set_size(cornerRadius, borderWidth + cornerRadius);
        this.translation_y = -borderWidth;

        this.remove_transition('opacity');
        this.ease({
            opacity: opacity * 255,
            duration: ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
        });
    }

    #log(str) {
        if (this.#settings.DEBUG.get())
            console.log(`[Panel corners] ${str}`);
    }
}
