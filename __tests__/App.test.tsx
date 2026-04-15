/**
 * @format
 */

import 'react-native';
import React from 'react';
import App from '../App';

// Note: import explicitly to use the types shipped with jest.
import {it} from '@jest/globals';

// Note: test renderer must be required after react-native.
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';

it('renders correctly', () => {
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<App />);
  });
  act(() => {
    tree.unmount();
  });
});
