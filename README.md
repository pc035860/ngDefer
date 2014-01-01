# ngDefer

An AngularJS directive for deferred DOM compiling.

**This module is experimental, may or may not has further development.**

### Experiement

http://plnkr.co/edit/BUkblXAD43pvAOmev4hi?p=preview

### Issues

- Though `ng-defer` deferred the transclude progress, it actually holds more DOM objects in memory than not using it. Hence increasing the item number has significant impact on deferred task performance.
- `ng-defer-repeat` has more problems lol
