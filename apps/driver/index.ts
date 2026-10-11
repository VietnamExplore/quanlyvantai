import { registerRootComponent } from 'expo';

import App from './App';
// Khai báo tác vụ gửi vị trí nền (giám sát hành trình) trước khi chạy app
import './src/gps';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
