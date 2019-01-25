import { Future, Result, Option } from '@ephox/katamari';
import { DropdownDetail, CommonDropdownDetail } from '../../ui/types/DropdownTypes';
import { TieredMenuSpec, TieredData } from '../../ui/types/TieredMenuTypes';

import { AlloyBehaviourRecord } from '../../api/behaviour/Behaviour';
import { AlloyComponent } from '../../api/component/ComponentApi';
import { SketchBehaviours } from '../../api/component/SketchBehaviours';
import { AlloySpec, RawDomSchema } from '../../api/component/SpecTypes';
import { CompositeSketch, CompositeSketchSpec } from '../../api/ui/Sketcher';

export interface SplitDropdownDetail extends CommonDropdownDetail<TieredData> {
  uid: string;
  dom: RawDomSchema;
  components: AlloySpec[ ];
  splitDropdownBehaviours: SketchBehaviours;
  toggleClass: string;

  onExecute: (comp: AlloyComponent, button: AlloyComponent) => void;
  onItemExecute: (comp: AlloyComponent, button: AlloyComponent, item: AlloyComponent) => void;
}

export interface SplitDropdownSpec extends CompositeSketchSpec {
  uid?: string;
  dom: RawDomSchema;
  role?: string;
  components?: AlloySpec[];
  splitDropdownBehaviours?: AlloyBehaviourRecord;
  eventOrder?: Record<string, string[]>;
  sandboxClasses?: string[];
  sandboxBehaviours?: AlloyBehaviourRecord;
  getHotspot?: (comp: AlloyComponent) => Option<AlloyComponent>;

  onExecute: (comp: AlloyComponent, button: AlloyComponent) => void;
  onItemExecute: (comp: AlloyComponent, button: AlloyComponent, item: AlloyComponent) => void;

  onOpen?: (anchor, comp: AlloyComponent, menu: AlloyComponent) => void;

  lazySink?: (comp: AlloyComponent) => Result<AlloyComponent, Error>;
  fetch: (comp: AlloyComponent) => Future<TieredData>;
  toggleClass: string;
  matchWidth?: boolean;
  useMinWidth?: boolean;

  parts: {
    menu: Partial<TieredMenuSpec>;
  };
}

export interface SplitDropdownSketcher extends CompositeSketch<SplitDropdownSpec, SplitDropdownDetail> { }