import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Cogl from 'gi://Cogl';
import GLib from 'gi://GLib';

/**
 * Creates a debounced version of a function that delays invoking the callback
 * until after `wait` milliseconds have elapsed since the last call.
 *
 * @param {Function} callback - The function to debounce
 * @param {number} wait - The number of milliseconds to delay
 * @returns {Function} The debounced function with a `cancel` method
 */
export function debounce(callback, wait) {
    let timeoutId = null;

    const debounced = function (...args) {
        if (timeoutId !== null) {
            GLib.source_remove(timeoutId);
        }

        timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, wait, () => {
            timeoutId = null;
            callback.apply(this, args);
            return GLib.SOURCE_REMOVE;
        });
    };

    debounced.cancel = function () {
        if (timeoutId !== null) {
            GLib.source_remove(timeoutId);
            timeoutId = null;
        }
    };

    return debounced;
}

export function lookup_for_length(node, prop, settings) {
    const use_extension_values = node && settings.FORCE_EXTENSION_VALUES.get();

    let lookup = [];
    if (use_extension_values)
        lookup = node.lookup_length(prop, false);

    if (use_extension_values || !lookup[0]) {
        let scale_factor =
            St.ThemeContext.get_for_stage(global.stage).scale_factor;
        let length = settings.get_property(prop.slice(1)).get();

        return length * scale_factor;
    } else {
        return lookup[1];
    }
};

export function lookup_for_double(node, prop, settings) {
    const use_extension_values = node && settings.FORCE_EXTENSION_VALUES.get();

    let lookup = [];
    if (use_extension_values)
        lookup = node.lookup_double(prop, false);

    if (use_extension_values || !lookup[0]) {
        return settings.get_property(prop.slice(1)).get();
    } else {
        return lookup[1];
    }
};

export function lookup_for_color(node, prop, settings) {
    const use_extension_values = node && settings.FORCE_EXTENSION_VALUES.get();

    let lookup = [];
    if (use_extension_values)
        lookup = node.lookup_color(prop, false);

    if (use_extension_values || !lookup[0]) {
        let color_str = settings.get_property(prop.slice(1)).get();
        let color_parsed = Clutter.Color ?
            Clutter.color_from_string(color_str) :
            Cogl.color_from_string(color_str);

        if (color_parsed[0]) {
            return color_parsed[1];
        } else {
            // could not parse color, defaulting to black
            settings.get_property(prop.slice(1)).set('#000000ff');

            return Clutter.Color ?
                Clutter.color_from_string('#000000ff')[1] :
                Cogl.color_from_string('#000000ff')[1];
        }
    } else {
        return lookup[1];
    }
};
