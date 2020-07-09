/**
 * Copyright (c) Tiny Technologies, Inc. All rights reserved.
 * Licensed under the LGPL or a commercial license.
 * For LGPL see License.txt in the project root for license information.
 * For commercial licenses see https://www.tiny.cloud/
 */

import { Element, HTMLElement, MouseEvent, Node, Range } from '@ephox/dom-globals';
import { Arr, Obj, Unicode } from '@ephox/katamari';
import { Attr, Compare, Element as SugarElement, Remove, SelectorFilter, SelectorFind } from '@ephox/sugar';
import Editor from './api/Editor';
import Env from './api/Env';
import VK from './api/util/VK';
import * as CaretContainer from './caret/CaretContainer';
import CaretPosition from './caret/CaretPosition';
import { isAfterContentEditableFalse, isBeforeContentEditableFalse } from './caret/CaretPositionPredicates';
import * as CaretUtils from './caret/CaretUtils';
import { CaretWalker } from './caret/CaretWalker';
import { FakeCaret, isFakeCaretTarget } from './caret/FakeCaret';
import * as LineUtils from './caret/LineUtils';
import * as NodeType from './dom/NodeType';
import * as RangePoint from './dom/RangePoint';
import * as DragDropOverrides from './DragDropOverrides';
import * as EditorView from './EditorView';
import * as CefFocus from './focus/CefFocus';
import * as EditorFocus from './focus/EditorFocus';
import * as NavigationUtils from './keyboard/NavigationUtils';

const isContentEditableTrue = NodeType.isContentEditableTrue;
const isContentEditableFalse = NodeType.isContentEditableFalse;

interface SelectionOverrides {
  showCaret: (direction: number, node: Element, before: boolean, scrollIntoView?: boolean) => Range | null;
  showBlockCaretContainer: (blockCaretContainer: Element) => void;
  hideFakeCaret: () => void;
  destroy: () => void;
}

const getContentEditableRoot = (editor: Editor, node: Node): Node => {
  const root = editor.getBody();

  while (node && node !== root) {
    if (isContentEditableTrue(node) || isContentEditableFalse(node)) {
      return node;
    }

    node = node.parentNode;
  }

  return null;
};

const SelectionOverrides = (editor: Editor): SelectionOverrides => {
  const selection = editor.selection, dom = editor.dom;
  const isBlock = dom.isBlock;

  const rootNode = editor.getBody();
  const fakeCaret = FakeCaret(editor, rootNode, isBlock, () => EditorFocus.hasFocus(editor));
  const realSelectionId = 'sel-' + dom.uniqueId();
  const elementSelectionAttr = 'data-mce-selected';
  let selectedElement;

  const isFakeSelectionElement = (elm: Node) => dom.hasClass(elm, 'mce-offscreen-selection');

  const getRealSelectionElement = () => {
    const container = dom.get(realSelectionId);
    return container ? container.getElementsByTagName('*')[0] as HTMLElement : container;
  };

  const setRange = (range: Range) => {
    // console.log('setRange', range);
    if (range) {
      selection.setRng(range);
    }
  };

  const getRange = selection.getRng;

  const showCaret = (direction: number, node: Element, before: boolean, scrollIntoView: boolean = true): Range => {
    const e = editor.fire('ShowCaret', {
      target: node,
      direction,
      before
    });

    if (e.isDefaultPrevented()) {
      return null;
    }

    if (scrollIntoView) {
      selection.scrollIntoView(node, direction === -1);
    }

    return fakeCaret.show(before, node);
  };

  const showBlockCaretContainer = (blockCaretContainer: Element) => {
    if (blockCaretContainer.hasAttribute('data-mce-caret')) {
      CaretContainer.showCaretContainerBlock(blockCaretContainer);
      setRange(getRange()); // Removes control rect on IE
      selection.scrollIntoView(blockCaretContainer);
    }
  };

  const registerEvents = () => {
    // Some browsers (Chrome) lets you place the caret after a cE=false
    // Make sure we render the caret container in this case
    editor.on('mouseup', (e) => {
      const range = getRange();

      if (range.collapsed && EditorView.isXYInContentArea(editor, e.clientX, e.clientY)) {
        setRange(NavigationUtils.renderCaretAtRange(editor, range, false));
      }
    });

    editor.on('click', (e) => {
      const contentEditableRoot = getContentEditableRoot(editor, e.target);
      if (contentEditableRoot) {
        // Prevent clicks on links in a cE=false element
        if (isContentEditableFalse(contentEditableRoot)) {
          e.preventDefault();
          editor.focus();
        }

        // Removes fake selection if a cE=true is clicked within a cE=false like the toc title
        if (isContentEditableTrue(contentEditableRoot)) {
          if (dom.isChildOf(contentEditableRoot, selection.getNode())) {
            removeElementSelection();
          }
        }
      }
    });

    editor.on('blur NewBlock', () => {
      removeElementSelection();
    });

    editor.on('ResizeWindow FullscreenStateChanged', () => fakeCaret.reposition());

    const handleTouchSelect = (editor: Editor) => {
      editor.on('tap', (e) => {
        const contentEditableRoot = getContentEditableRoot(editor, e.target);
        if (isContentEditableFalse(contentEditableRoot)) {
          e.preventDefault();
          setElementSelection(NavigationUtils.selectNode(editor, contentEditableRoot));
        }
      }, true);
    };

    const hasNormalCaretPosition = (elm: Element) => {
      const caretWalker = CaretWalker(elm);

      if (!elm.firstChild) {
        return false;
      }

      const startPos = CaretPosition.before(elm.firstChild);
      const newPos = caretWalker.next(startPos);

      return newPos && !isBeforeContentEditableFalse(newPos) && !isAfterContentEditableFalse(newPos);
    };

    const isInSameBlock = (node1: Node, node2: Node) => {
      const block1 = dom.getParent(node1, isBlock);
      const block2 = dom.getParent(node2, isBlock);
      return block1 === block2;
    };

    // Checks if the target node is in a block and if that block has a caret position better than the
    // suggested caretNode this is to prevent the caret from being sucked in towards a cE=false block if
    // they are adjacent on the vertical axis
    const hasBetterMouseTarget = (targetNode: Node, caretNode: Node) => {
      const targetBlock = dom.getParent(targetNode, isBlock);
      const caretBlock = dom.getParent(caretNode, isBlock);

      // Click inside the suggested caret element
      if (targetBlock && targetNode !== caretBlock && dom.isChildOf(targetBlock, caretBlock) && (isContentEditableFalse(getContentEditableRoot(editor, targetBlock)) === false)) {
        return true;
      }

      return targetBlock && !isInSameBlock(targetBlock, caretBlock) && hasNormalCaretPosition(targetBlock);
    };

    handleTouchSelect(editor);

    editor.on('mousedown', (e: MouseEvent) => {
      const targetElm = e.target as Element;

      if (targetElm !== rootNode && targetElm.nodeName !== 'HTML' && !dom.isChildOf(targetElm, rootNode)) {
        return;
      }

      if (EditorView.isXYInContentArea(editor, e.clientX, e.clientY) === false) {
        return;
      }

      const contentEditableRoot = getContentEditableRoot(editor, targetElm);
      if (contentEditableRoot) {
        if (isContentEditableFalse(contentEditableRoot)) {
          e.preventDefault();
          setElementSelection(NavigationUtils.selectNode(editor, contentEditableRoot));
        } else {
          removeElementSelection();

          // Check that we're not attempting a shift + click select within a contenteditable='true' element
          if (!(isContentEditableTrue(contentEditableRoot) && e.shiftKey) && !RangePoint.isXYWithinRange(e.clientX, e.clientY, selection.getRng())) {
            hideFakeCaret();
            selection.placeCaretAt(e.clientX, e.clientY);
          }
        }
      } else if (isFakeCaretTarget(targetElm) === false) {
        // Remove needs to be called here since the mousedown might alter the selection without calling selection.setRng
        // and therefore not fire the AfterSetSelectionRange event.
        removeElementSelection();
        hideFakeCaret();

        const fakeCaretInfo = LineUtils.closestFakeCaret(rootNode, e.clientX, e.clientY);
        if (fakeCaretInfo) {
          if (!hasBetterMouseTarget(targetElm, fakeCaretInfo.node)) {
            e.preventDefault();
            const range = showCaret(1, fakeCaretInfo.node as HTMLElement, fakeCaretInfo.before, false);
            editor.getBody().focus();
            setRange(range);
          }
        }
      }
    });

    editor.on('keypress', (e) => {
      if (VK.modifierPressed(e)) {
        return;
      }

      switch (e.keyCode) {
        default:
          if (isContentEditableFalse(selection.getNode())) {
            e.preventDefault();
          }
          break;
      }
    });

    editor.on('GetSelectionRange', (e) => {
      let rng = e.range;

      if (selectedElement) {
        if (!selectedElement.parentNode) {
          selectedElement = null;
          return;
        }

        rng = rng.cloneRange();
        rng.selectNode(selectedElement);
        e.range = rng;
      }
    });

    editor.on('SetSelectionRange', (e) => {
      // If the range is set inside a short ended element, then move it
      // to the side as IE for example will try to add content inside
      e.range = normalizeShortEndedElementSelection(e.range);

      const rng = setElementSelection(e.range, e.forward);
      if (rng) {
        e.range = rng;
      }
    });

    const isPasteBin = (node: Element): boolean => node.id === 'mcepastebin';

    editor.on('AfterSetSelectionRange', (e) => {
      const rng = e.range;
      const parentNode = rng.startContainer.parentNode;

      if (!isRangeInCaretContainer(rng) && !isPasteBin(parentNode as Element)) {
        hideFakeCaret();
      }

      if (!isFakeSelectionElement(parentNode)) {
        removeElementSelection();
      }
    });

    editor.on('copy', (e) => {
      const clipboardData = e.clipboardData;

      // Make sure we get proper html/text for the fake cE=false selection
      // Doesn't work at all on Edge since it doesn't have proper clipboardData support
      if (!e.isDefaultPrevented() && e.clipboardData && !Env.ie) {
        const realSelectionElement = getRealSelectionElement();
        if (realSelectionElement) {
          e.preventDefault();
          clipboardData.clearData();
          clipboardData.setData('text/html', realSelectionElement.outerHTML);
          clipboardData.setData('text/plain', realSelectionElement.outerText);
        }
      }
    });

    DragDropOverrides.init(editor);
    CefFocus.setup(editor);
  };

  const isWithinCaretContainer = (node: Node) => (
    CaretContainer.isCaretContainer(node) ||
    CaretContainer.startsWithCaretContainer(node) ||
    CaretContainer.endsWithCaretContainer(node)
  );

  const isRangeInCaretContainer = (rng: Range) =>
    isWithinCaretContainer(rng.startContainer) || isWithinCaretContainer(rng.endContainer);

  const normalizeShortEndedElementSelection = (rng: Range) => {
    const shortEndedElements = editor.schema.getShortEndedElements();
    const newRng = dom.createRng();
    const startContainer = rng.startContainer;
    const startOffset = rng.startOffset;
    const endContainer = rng.endContainer;
    const endOffset = rng.endOffset;

    if (Obj.has(shortEndedElements, startContainer.nodeName.toLowerCase())) {
      if (startOffset === 0) {
        newRng.setStartBefore(startContainer);
      } else {
        newRng.setStartAfter(startContainer);
      }
    } else {
      newRng.setStart(startContainer, startOffset);
    }

    if (Obj.has(shortEndedElements, endContainer.nodeName.toLowerCase())) {
      if (endOffset === 0) {
        newRng.setEndBefore(endContainer);
      } else {
        newRng.setEndAfter(endContainer);
      }
    } else {
      newRng.setEnd(endContainer, endOffset);
    }

    return newRng;
  };

  const setupOffscreenSelection = (node: Element, targetClone: Node, origTargetClone: Node) => {
    const $ = editor.$;
    let $realSelectionContainer = SelectorFind.descendant(SugarElement.fromDom(editor.getBody()), '#' + realSelectionId).fold(
      () => $([]),
      (elm) => $([ elm.dom() ])
    );

    if ($realSelectionContainer.length === 0) {
      $realSelectionContainer = $(
        '<div data-mce-bogus="all" class="mce-offscreen-selection"></div>'
      ).attr('id', realSelectionId);

      $realSelectionContainer.appendTo(editor.getBody());
    }

    const newRange = dom.createRng();

    // WHY is IE making things so hard! Copy on <i contentEditable="false">x</i> produces: <em>x</em>
    // This is a ridiculous hack where we place the selection from a block over the inline element
    // so that just the inline element is copied as is and not converted.
    if (targetClone === origTargetClone && Env.ie) {
      $realSelectionContainer.empty().append('<p style="font-size: 0" data-mce-bogus="all">\u00a0</p>').append(targetClone);
      newRange.setStartAfter($realSelectionContainer[0].firstChild.firstChild);
      newRange.setEndAfter(targetClone);
    } else {
      $realSelectionContainer.empty().append(Unicode.nbsp).append(targetClone).append(Unicode.nbsp);
      newRange.setStart($realSelectionContainer[0].firstChild, 1);
      newRange.setEnd($realSelectionContainer[0].lastChild, 0);
    }

    $realSelectionContainer.css({
      top: dom.getPos(node, editor.getBody()).y
    });

    $realSelectionContainer[0].focus();
    const sel = selection.getSel();
    sel.removeAllRanges();
    sel.addRange(newRange);

    return newRange;
  };

  const selectElement = (elm: Element) => {
    const targetClone = elm.cloneNode(true);
    const e = editor.fire('ObjectSelected', { target: elm, targetClone });
    if (e.isDefaultPrevented()) {
      return null;
    }

    // Setup the offscreen selection
    const range = setupOffscreenSelection(elm, e.targetClone, targetClone);

    // We used to just remove all data-mce-selected values and set 1 on node.
    // But data-mce-selected can be values other than 1 so keep existing value if
    // node has one, and remove data-mce-selected from everything else
    const nodeElm = SugarElement.fromDom(elm);
    Arr.each(SelectorFilter.descendants(SugarElement.fromDom(editor.getBody()), '*[data-mce-selected]'), (elm) => {
      if (!Compare.eq(nodeElm, elm)) {
        Attr.remove(elm, elementSelectionAttr);
      }
    });

    if (!dom.getAttrib(elm, elementSelectionAttr)) {
      elm.setAttribute(elementSelectionAttr, '1');
    }
    selectedElement = elm;
    hideFakeCaret();

    return range;
  };

  const setElementSelection = (range: Range, forward?: boolean) => {
    if (!range) {
      return null;
    }

    if (range.collapsed) {
      if (!isRangeInCaretContainer(range)) {
        const dir = forward ? 1 : -1;
        const caretPosition = CaretUtils.getNormalizedRangeEndPoint(dir, rootNode, range);

        const beforeNode = caretPosition.getNode(!forward);
        if (isFakeCaretTarget(beforeNode)) {
          return showCaret(dir, beforeNode, forward ? !caretPosition.isAtEnd() : false, false);
        }

        const afterNode = caretPosition.getNode(forward);
        if (isFakeCaretTarget(afterNode)) {
          return showCaret(dir, afterNode, forward ? false : !caretPosition.isAtEnd(), false);
        }
      }

      return null;
    }

    let startContainer = range.startContainer;
    let startOffset = range.startOffset;
    const endOffset = range.endOffset;

    // Normalizes <span cE=false>[</span>] to [<span cE=false></span>]
    if (startContainer.nodeType === 3 && startOffset === 0 && isContentEditableFalse(startContainer.parentNode)) {
      startContainer = startContainer.parentNode;
      startOffset = dom.nodeIndex(startContainer);
      startContainer = startContainer.parentNode;
    }

    if (startContainer.nodeType !== 1) {
      return null;
    }

    if (endOffset === startOffset + 1 && startContainer === range.endContainer) {
      const node = startContainer.childNodes[startOffset];

      if (isContentEditableFalse(node) || NodeType.isMedia(node)) {
        return selectElement(node);
      }
    }

    return null;
  };

  const removeElementSelection = () => {
    if (selectedElement) {
      selectedElement.removeAttribute(elementSelectionAttr);
    }
    SelectorFind.descendant(SugarElement.fromDom(editor.getBody()), '#' + realSelectionId).each(Remove.remove);
    selectedElement = null;
  };

  const destroy = () => {
    fakeCaret.destroy();
    selectedElement = null;
  };

  const hideFakeCaret = () => {
    fakeCaret.hide();
  };

  if (Env.ceFalse) {
    registerEvents();
  }

  return {
    showCaret,
    showBlockCaretContainer,
    hideFakeCaret,
    destroy
  };
};

export default SelectionOverrides;
