import { Element, Node, Range } from '@ephox/dom-globals';
import { Arr, Fun, Option } from '@ephox/katamari';
import Editor from '../api/Editor';
import * as CaretContainer from '../caret/CaretContainer';
import CaretPosition from '../caret/CaretPosition';
import * as CaretUtils from '../caret/CaretUtils';
import { CaretWalker, HDirection } from '../caret/CaretWalker';
import { getPositionsUntilNextLine, getPositionsUntilPreviousLine } from '../caret/LineReader';
import * as LineUtils from '../caret/LineUtils';
import * as LineWalker from '../caret/LineWalker';
import * as NodeType from '../dom/NodeType';
import * as ScrollIntoView from '../dom/ScrollIntoView';
import * as RangeNodes from '../selection/RangeNodes';
import * as ArrUtils from '../util/ArrUtils';
import * as InlineUtils from './InlineUtils';

const isContentEditableTrue = NodeType.isContentEditableTrue;
const isContentEditableFalse = NodeType.isContentEditableFalse;

const showCaret = (direction, editor: Editor, node: Element, before: boolean, scrollIntoView: boolean): Range =>
  // TODO: Figure out a better way to handle this dependency
  editor._selectionOverrides.showCaret(direction, node, before, scrollIntoView);

const getNodeRange = (node: Element): Range => {
  const rng = node.ownerDocument.createRange();
  rng.selectNode(node);
  return rng;
};

const selectNode = (editor, node: Element): Range => {
  const e = editor.fire('BeforeObjectSelected', { target: node });
  if (e.isDefaultPrevented()) {
    return null;
  }

  return getNodeRange(node);
};

const moveToRange = (editor: Editor, rng: Range) => {
  editor.selection.setRng(rng);
  // Don't reuse the original range as TinyMCE will adjust it
  ScrollIntoView.scrollRangeIntoView(editor, editor.selection.getRng());
};

const renderCaretAtRange = (editor: Editor, range: Range, scrollIntoView: boolean): Range => {
  const normalizedRange = CaretUtils.normalizeRange(1, editor.getBody(), range);
  const caretPosition = CaretPosition.fromRangeStart(normalizedRange);

  const caretPositionNode = caretPosition.getNode();

  if (isContentEditableFalse(caretPositionNode)) {
    return showCaret(1, editor, caretPositionNode, !caretPosition.isAtEnd(), false);
  }

  const caretPositionBeforeNode = caretPosition.getNode(true);

  if (isContentEditableFalse(caretPositionBeforeNode)) {
    return showCaret(1, editor, caretPositionBeforeNode, false, false);
  }

  // TODO: Should render caret before/after depending on where you click on the page forces after now
  const ceRoot = editor.dom.getParent(caretPosition.getNode(), (node) => isContentEditableFalse(node) || isContentEditableTrue(node));
  if (isContentEditableFalse(ceRoot)) {
    return showCaret(1, editor, ceRoot, false, scrollIntoView);
  }

  return null;
};

const renderRangeCaret = (editor: Editor, range: Range, scrollIntoView: boolean): Range => {
  if (!range || !range.collapsed) {
    return range;
  }

  const caretRange = renderCaretAtRange(editor, range, scrollIntoView);
  if (caretRange) {
    return caretRange;
  }

  return range;
};

const moveHorizontally = (editor: Editor, direction: HDirection, range: Range, isBefore: (caretPosition: CaretPosition) => boolean,
                          isAfter: (caretPosition: CaretPosition) => boolean, isElement: (node: Node) => node is Element): Range | null => {
  const forwards = direction === HDirection.Forwards;
  const caretWalker = CaretWalker(editor.getBody());
  const getNextPosFn = Fun.curry(CaretUtils.getVisualCaretPosition, forwards ? caretWalker.next : caretWalker.prev);
  const isBeforeFn = forwards ? isBefore : isAfter;

  if (!range.collapsed) {
    const node = RangeNodes.getSelectedNode(range);
    if (isElement(node)) {
      return showCaret(direction, editor, node, direction === HDirection.Backwards, false);
    }
  }

  const caretPosition = CaretUtils.getNormalizedRangeEndPoint(direction, editor.getBody(), range);
  if (isBeforeFn(caretPosition)) {
    return selectNode(editor, caretPosition.getNode(!forwards) as Element);
  }

  const nextCaretPosition = InlineUtils.normalizePosition(forwards, getNextPosFn(caretPosition));
  const rangeIsInContainerBlock = CaretContainer.isRangeInCaretContainerBlock(range);
  if (!nextCaretPosition) {
    if (rangeIsInContainerBlock) {
      return range;
    }

    return null;
  }

  if (isBeforeFn(nextCaretPosition)) {
    return showCaret(direction, editor, nextCaretPosition.getNode(!forwards) as Element, forwards, false);
  }

  // Peek ahead for handling of ab|c<span cE=false> -> abc|<span cE=false>
  const peekCaretPosition = getNextPosFn(nextCaretPosition);
  if (peekCaretPosition && isBeforeFn(peekCaretPosition)) {
    if (CaretUtils.isMoveInsideSameBlock(nextCaretPosition, peekCaretPosition)) {
      return showCaret(direction, editor, peekCaretPosition.getNode(!forwards) as Element, forwards, false);
    }
  }

  if (rangeIsInContainerBlock) {
    return renderRangeCaret(editor, nextCaretPosition.toRange(), false);
  }

  return null;
};

const moveVertically = (editor: Editor, direction: LineWalker.VDirection, range: Range, isBefore: (caretPosition: CaretPosition) => boolean,
                        isAfter: (caretPosition: CaretPosition) => boolean, isElement: (node: Node) => node is Element): Range | null => {
  const caretPosition = CaretUtils.getNormalizedRangeEndPoint(direction, editor.getBody(), range);
  const caretClientRect = ArrUtils.last(caretPosition.getClientRects());

  if (!caretClientRect) {
    return null;
  }

  const walkerFn = direction === LineWalker.VDirection.Down ? LineWalker.downUntil : LineWalker.upUntil;
  const linePositions = walkerFn(editor.getBody(), LineWalker.isAboveLine(1), caretPosition);
  const nextLinePositions = Arr.filter(linePositions, LineWalker.isLine(1));

  const clientX = caretClientRect.left;
  const nextLineRect = LineUtils.findClosestClientRect(nextLinePositions, clientX);
  if (nextLineRect && isElement(nextLineRect.node)) {
    const dist1 = Math.abs(clientX - nextLineRect.left);
    const dist2 = Math.abs(clientX - nextLineRect.right);

    return showCaret(direction, editor, nextLineRect.node, dist1 < dist2, false);
  }

  let currentNode;
  if (isBefore(caretPosition)) {
    currentNode = caretPosition.getNode();
  } else if (isAfter(caretPosition)) {
    currentNode = caretPosition.getNode(true);
  } else {
    currentNode = RangeNodes.getSelectedNode(range);
  }

  if (currentNode) {
    const caretPositions = LineWalker.positionsUntil(direction, editor.getBody(), LineWalker.isAboveLine(1), currentNode);

    let closestNextLineRect = LineUtils.findClosestClientRect(Arr.filter(caretPositions, LineWalker.isLine(1)), clientX);
    if (closestNextLineRect) {
      return renderRangeCaret(editor, closestNextLineRect.position.toRange(), false);
    }

    closestNextLineRect = ArrUtils.last(Arr.filter(caretPositions, LineWalker.isLine(0)));
    if (closestNextLineRect) {
      return renderRangeCaret(editor, closestNextLineRect.position.toRange(), false);
    }
  }

  return null;
};

const getLineEndPoint = (editor: Editor, forward: boolean): Option<CaretPosition> => {
  const rng = editor.selection.getRng();
  const body = editor.getBody();

  if (forward) {
    const from = CaretPosition.fromRangeEnd(rng);
    const result = getPositionsUntilNextLine(body, from);
    return Arr.last(result.positions);
  } else {
    const from = CaretPosition.fromRangeStart(rng);
    const result = getPositionsUntilPreviousLine(body, from);
    return Arr.head(result.positions);
  }
};

const moveToLineEndPoint = (editor: Editor, forward: boolean, isElementPosition: (pos: CaretPosition) => boolean) =>
  getLineEndPoint(editor, forward).filter(isElementPosition).map((pos) => {
    editor.selection.setRng(pos.toRange());
    return true;
  }).getOr(false);

export {
  showCaret,
  selectNode,
  renderCaretAtRange,
  renderRangeCaret,
  moveHorizontally,
  moveVertically,
  moveToLineEndPoint,
  moveToRange
};
