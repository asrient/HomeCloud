/*
* Implementation based on: https://github.com/Hypercubed/mini-signals/blob/master/src/mini-signals.ts
* Reference: https://github.com/millermedeiros/js-signals/wiki/Comparison-between-different-Observer-Pattern-implementations
*/
import { SignalMetadata } from './types';

type CallBack<T extends any[]> = (...x: T) => void;

const SIGNAL_KEY = Symbol('SIGNAL');

export interface SignalNodeRef<T, S> {
  [SIGNAL_KEY]: Symbol;
  __brand?: S;
  __type?: T;
}

interface SignalNode<T extends any[]> {
  fn: CallBack<T>;
  next?: SignalNode<T>;
  prev?: SignalNode<T>;
}

function isSignalNodeRef(obj: any): obj is SignalNodeRef<any, any> {
  return typeof obj === 'object' && SIGNAL_KEY in obj;
}

export default class Signal<T extends any[] = any[], S extends any = Symbol | string> {
  /**
   * A Symbol that is used to guarantee the uniqueness of the Signal
   * instance.
   */
  private readonly _symbol = Symbol('Signal');
  private _refMap = new WeakMap<SignalNodeRef<T, S>, SignalNode<T>>();

  private _head?: SignalNode<T> = undefined;
  private _tail?: SignalNode<T> = undefined;
  private _dispatching = false;
  private _metadata: SignalMetadata | undefined = undefined;

  /**
   * Creates a new Signal instance.
   * @param metadata Metadata for the signal.
   */
  constructor(metadata?: SignalMetadata) {
    this._metadata = metadata;
  }

  /**
   * Returns the metadata for the signal.
   * @returns Metadata for the signal.
   */
  public getMetadata(): SignalMetadata | null {
    return this._metadata || null;
  }

  hasListeners(): boolean {
    return this._head != null;
  }

  /**
   * Dispatches a signal to all registered listeners.
   */
  dispatch(...args: T): boolean {
    if (this._dispatching) {
      throw new Error('Signal#dispatch(): Signal already dispatching.');
    }

    let node = this._head;

    if (node == null) return false;
    this._dispatching = true;

    while (node != null) {
      node.fn(...args);
      node = node.next;
    }

    this._dispatching = false;
    return true;
  }

  /**
   * Register a new listener.
   */
  add(fn: CallBack<T>): SignalNodeRef<T, S> {
    if (typeof fn !== 'function') {
      throw new Error('Signal#add(): First arg must be a Function.');
    }
    return this._createRef(this._addNode({ fn }));
  }

  /**
   * Remove binding object.
   */
  detach(sym: SignalNodeRef<T, S>): this {
    if (!isSignalNodeRef(sym)) {
      throw new Error(
        'Signal#detach(): First arg must be a Signal listener reference.'
      );
    }

    if (sym[SIGNAL_KEY] !== this._symbol) {
      throw new Error(
        'Signal#detach(): Signal listener does not belong to this Signal.'
      );
    }

    const node = this._refMap.get(sym);

    if (!node) return this; // already detached

    this._refMap.delete(sym);
    this._disconnectNode(node);
    this._destroyNode(node);

    return this;
  }

  /**
   * Detach all listeners.
   */
  detachAll(): this {
    let n = this._head;
    if (n == null) return this;

    this._head = this._tail = undefined;
    this._refMap = new WeakMap();

    while (n != null) {
      this._destroyNode(n);
      n = n.next;
    }

    return this;
  }

  private _destroyNode(node: SignalNode<T>) {
    node.fn = undefined as any;
    node.prev = undefined;
  }

  private _disconnectNode(node: SignalNode<T>) {
    if (node === this._head) {
      // first node
      this._head = node.next;
      if (node.next == null) {
        this._tail = undefined;
      }
    } else if (node === this._tail) {
      // last node
      this._tail = node.prev;
      if (this._tail != null) {
        this._tail.next = undefined;
      }
    }

    if (node.prev != null) {
      node.prev.next = node.next;
    }
    if (node.next != null) {
      node.next.prev = node.prev;
    }
  }

  private _addNode(node: SignalNode<T>): SignalNode<T> {
    if (this._head == null) {
      this._head = node;
      this._tail = node;
    } else {
      // eslint-disable-next-line  @typescript-eslint/no-non-null-assertion
      this._tail!.next = node;
      node.prev = this._tail;
      this._tail = node;
    }

    return node;
  }

  private _createRef(node: SignalNode<T>): SignalNodeRef<T, S> {
    const sym = { [SIGNAL_KEY]: this._symbol } as unknown as SignalNodeRef<T, S>;
    this._refMap.set(sym, node);
    return sym;
  }

  protected _getRef(sym: SignalNodeRef<T, S>) {
    return this._refMap.get(sym);
  }
}
