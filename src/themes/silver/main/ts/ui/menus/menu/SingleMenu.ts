import { UiFactoryBackstageProviders } from '../../../backstage/Backstage';
import { AlloyEvents, FocusManagers, Keying, TieredMenu } from '@ephox/alloy';
import { ItemSpec } from '@ephox/alloy/lib/main/ts/ephox/alloy/ui/types/ItemTypes';
import { MenuSpec } from '@ephox/alloy/lib/main/ts/ephox/alloy/ui/types/MenuTypes';
import { ValueSchema } from '@ephox/boulder';
import { Menu as BridgeMenu, Types, InlineContent } from '@ephox/bridge';
import { Arr, Option, Options } from '@ephox/katamari';

import { detectSize } from '../../alien/FlatgridAutodetect';
import { SimpleBehaviours } from '../../alien/SimpleBehaviours';
import * as MenuItems from '../item/MenuItems';
import { deriveMenuMovement } from './MenuMovement';
import { components as menuComponents, dom as menuDom, markers as getMenuMarkers } from './MenuParts';
import { forSwatch, forCollection, forToolbar } from './MenuStructures';

export type ItemChoiceActionHandler = (value: string) => void;

export enum FocusMode { ContentFocus, UiFocus }

export const handleError = (error) => {
  // tslint:disable-next-line:no-console
  console.error(ValueSchema.formatError(error));
  console.log(error);
  return Option.none();
};

export interface InternalStyleMenuItemApi {
  type: 'styleitem';
  item: BridgeMenu.ToggleMenuItemApi | BridgeMenu.MenuItemApi;
}

export type SingleMenuItemApi = BridgeMenu.MenuItemApi | BridgeMenu.ToggleMenuItemApi | BridgeMenu.SeparatorMenuItemApi |
  BridgeMenu.ChoiceMenuItemApi | InternalStyleMenuItemApi | BridgeMenu.FancyMenuItemApi;

const hasIcon = (item) => item.icon !== undefined;
const menuHasIcons = (xs: SingleMenuItemApi[]) => Arr.exists(xs, hasIcon);

const createMenuItemFromBridge = (item: SingleMenuItemApi, itemResponse: MenuItems.ItemResponse, providersBackstage: UiFactoryBackstageProviders): Option<ItemSpec> => {
  switch (item.type) {
    case 'menuitem':
      return BridgeMenu.createMenuItem(item).fold(
        handleError,
        (d) => Option.some(MenuItems.normal(d, itemResponse, providersBackstage))
      );

    case 'styleitem': {
      if (item.item.type === 'menuitem') {
        return BridgeMenu.createMenuItem(item.item).fold(handleError, (d) => Option.some(MenuItems.style(d, itemResponse, providersBackstage)));
      } else if (item.item.type === 'togglemenuitem') {
        return BridgeMenu.createToggleMenuItem(item.item).fold(handleError, (d) => Option.some(MenuItems.style(d, itemResponse, providersBackstage)));
      } else {
        console.error('Unsupported style item delegate', item.item);
        return Option.none();
      }
    }

    case 'togglemenuitem':
      return BridgeMenu.createToggleMenuItem(item).fold(
        handleError,
        (d) => Option.some(MenuItems.toggle(d, itemResponse, providersBackstage))
      );
    case 'separator':
      return BridgeMenu.createSeparatorMenuItem(item).fold(
        handleError,
        (d) => Option.some(MenuItems.separator(d))
      );
    case 'fancymenuitem':
      return BridgeMenu.createFancyMenuItem(item).fold(
        handleError,
        (d) => MenuItems.fancy(d)
      );
    default: {
      console.error('Unknown item in general menu', item);
      return Option.none();
    }
  }
};

// TODO: Potentially make this private again.
export const createPartialMenuWithAlloyItems = (value: string, hasIcons: boolean, items: ItemSpec[], columns: Types.ColumnTypes, presets: Types.PresetTypes): Partial<MenuSpec> => {
  if (presets === 'color') {
    const structure = forSwatch(columns);
    return {
      value,
      dom: structure.dom,
      components: structure.components,
      items
    };
  }

  if (presets === 'normal' && columns === 'auto') {
    const structure = forCollection(columns, items);
    return {
      value,
      dom: structure.dom,
      components: structure.components,
      items
    };
  }

  if (presets === 'normal' && columns === 1) {
    const structure = forCollection(1, items);
    return {
      value,
      dom: structure.dom,
      components: structure.components,
      items
    };
  }

  if (presets === 'normal') {
    const structure = forCollection(columns, items);
    return {
      value,
      dom: structure.dom,
      components: structure.components,
      items
    };
  }

  if (presets === 'toolbar' && columns !== 'auto') {
    const structure = forToolbar(columns);
    return {
      value,
      dom: structure.dom,
      components: structure.components,
      items
    };
  }

  return {
    value,
    dom:  menuDom(hasIcons, columns, presets),
    components: menuComponents,
    items
  };
};

export const createChoiceItems = (items: SingleMenuItemApi[], onItemValueHandler: (itemValue: string) => void, columns: 'auto' | number, itemPresets: Types.PresetItemTypes, itemResponse: MenuItems.ItemResponse, select: (value: string) => boolean, providersBackstage: UiFactoryBackstageProviders): ItemSpec[] => {
  return Options.cat(
    Arr.map(items, (item) => {
      if (item.type === 'choiceitem') {
        return BridgeMenu.createChoiceMenuItem(item).fold(
          handleError,
          (d: BridgeMenu.ChoiceMenuItem) => Option.some(MenuItems.choice(d, columns === 1, itemPresets, onItemValueHandler, select(item.value), itemResponse, providersBackstage))
        );
      } else {
        return Option.none();
      }
    })
  );
};

export const createAutocompleteItems = (items: InlineContent.AutocompleterItemApi[], onItemValueHandler: (itemValue: string, itemMeta: Record<string, any>) => void, columns: 'auto' | number,  itemResponse: MenuItems.ItemResponse, providersBackstage: UiFactoryBackstageProviders): ItemSpec[] => {
  return Options.cat(
    Arr.map(items, (item) => {
      return InlineContent.createAutocompleterItem(item).fold(
        handleError,
        (d: InlineContent.AutocompleterItem) => Option.some(
          MenuItems.autocomplete(d, columns === 1, 'normal', onItemValueHandler, itemResponse, providersBackstage)
        )
      );
    })
  );
};

export const createPartialChoiceMenu = (value: string, items: SingleMenuItemApi[], onItemValueHandler: (itemValue: string) => void, columns: 'auto' | number, presets: Types.PresetTypes, itemResponse: MenuItems.ItemResponse, select: (value: string) => boolean, providersBackstage: UiFactoryBackstageProviders): Partial<MenuSpec> => {
  const hasIcons = menuHasIcons(items);
  const presetItemTypes = presets !== 'color' ? 'normal' : 'color';
  const alloyItems = createChoiceItems(items, onItemValueHandler, columns, presetItemTypes, itemResponse, select, providersBackstage);
  return createPartialMenuWithAlloyItems(value, hasIcons, alloyItems, columns, presets);
};

export const createPartialMenu = (value: string, items: SingleMenuItemApi[], itemResponse: MenuItems.ItemResponse, providersBackstage: UiFactoryBackstageProviders): Partial<MenuSpec> => {
  const hasIcons = menuHasIcons(items);
  const alloyItems = Options.cat<ItemSpec>(
    Arr.map(items, (item) => {
      return createMenuItemFromBridge(item, itemResponse, providersBackstage);
    })
  );
  return createPartialMenuWithAlloyItems(value, hasIcons, alloyItems, 1, 'normal');
};

export const createTieredDataFrom = (partialMenu: Partial<MenuSpec>) => {
  return TieredMenu.singleData(partialMenu.value, partialMenu);
};

export const createMenuFrom = (partialMenu: Partial<MenuSpec>, columns: number | 'auto', focusMode: FocusMode, presets: Types.PresetTypes): MenuSpec  => {
  const focusManager = focusMode === FocusMode.ContentFocus ? FocusManagers.highlights() : FocusManagers.dom();

  const movement = deriveMenuMovement(columns, presets);
  const menuMarkers = getMenuMarkers(presets);

  return {
    dom: partialMenu.dom,
    components: partialMenu.components,
    items: partialMenu.items,
    value: partialMenu.value,
    markers: {
      selectedItem: menuMarkers.selectedItem,
      item: menuMarkers.item
    },
    movement,
    fakeFocus: focusMode === FocusMode.ContentFocus,
    focusManager,

    menuBehaviours: SimpleBehaviours.unnamedEvents(columns !== 'auto' ? [ ] : [
      AlloyEvents.runOnAttached((comp, se) => {
        detectSize(comp, 4, menuMarkers.item).each(({ numColumns, numRows }) => {
          Keying.setGridSize(comp, numRows, numColumns);
        });
      })
    ])
  };
};