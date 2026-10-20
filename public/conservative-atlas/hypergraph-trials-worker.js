(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __typeError = (msg) => {
    throw TypeError(msg);
  };
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
  var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
  var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
  var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
  var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

  // node_modules/ml-matrix/matrix.js
  var require_matrix = __commonJS({
    "node_modules/ml-matrix/matrix.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      var toString = Object.prototype.toString;
      function isAnyArray(value) {
        const tag = toString.call(value);
        return tag.endsWith("Array]") && !tag.includes("Big");
      }
      function max(input, options = {}) {
        if (!isAnyArray(input)) {
          throw new TypeError("input must be an array");
        }
        if (input.length === 0) {
          throw new TypeError("input must not be empty");
        }
        const { fromIndex = 0, toIndex = input.length } = options;
        if (fromIndex < 0 || fromIndex >= input.length || !Number.isInteger(fromIndex)) {
          throw new Error("fromIndex must be a positive integer smaller than length");
        }
        if (toIndex <= fromIndex || toIndex > input.length || !Number.isInteger(toIndex)) {
          throw new Error("toIndex must be an integer greater than fromIndex and at most equal to length");
        }
        let maxValue = input[fromIndex];
        for (let i = fromIndex + 1; i < toIndex; i++) {
          if (input[i] > maxValue)
            maxValue = input[i];
        }
        return maxValue;
      }
      function min(input, options = {}) {
        if (!isAnyArray(input)) {
          throw new TypeError("input must be an array");
        }
        if (input.length === 0) {
          throw new TypeError("input must not be empty");
        }
        const { fromIndex = 0, toIndex = input.length } = options;
        if (fromIndex < 0 || fromIndex >= input.length || !Number.isInteger(fromIndex)) {
          throw new Error("fromIndex must be a positive integer smaller than length");
        }
        if (toIndex <= fromIndex || toIndex > input.length || !Number.isInteger(toIndex)) {
          throw new Error("toIndex must be an integer greater than fromIndex and at most equal to length");
        }
        let minValue = input[fromIndex];
        for (let i = fromIndex + 1; i < toIndex; i++) {
          if (input[i] < minValue)
            minValue = input[i];
        }
        return minValue;
      }
      function rescale(input, options = {}) {
        if (!isAnyArray(input)) {
          throw new TypeError("input must be an array");
        } else if (input.length === 0) {
          throw new TypeError("input must not be empty");
        }
        let output;
        if (options.output !== void 0) {
          if (!isAnyArray(options.output)) {
            throw new TypeError("output option must be an array if specified");
          }
          output = options.output;
        } else {
          output = new Array(input.length);
        }
        const currentMin = min(input);
        const currentMax = max(input);
        if (currentMin === currentMax) {
          throw new RangeError("minimum and maximum input values are equal. Cannot rescale a constant array");
        }
        const { min: minValue = options.autoMinMax ? currentMin : 0, max: maxValue = options.autoMinMax ? currentMax : 1 } = options;
        if (minValue >= maxValue) {
          throw new RangeError("min option must be smaller than max option");
        }
        const factor = (maxValue - minValue) / (currentMax - currentMin);
        for (let i = 0; i < input.length; i++) {
          output[i] = (input[i] - currentMin) * factor + minValue;
        }
        return output;
      }
      var indent = " ".repeat(2);
      var indentData = " ".repeat(4);
      function inspectMatrix() {
        return inspectMatrixWithOptions(this);
      }
      function inspectMatrixWithOptions(matrix2, options = {}) {
        const {
          maxRows = 15,
          maxColumns = 10,
          maxNumSize = 8,
          padMinus = "auto"
        } = options;
        return `${matrix2.constructor.name} {
${indent}[
${indentData}${inspectData(matrix2, maxRows, maxColumns, maxNumSize, padMinus)}
${indent}]
${indent}rows: ${matrix2.rows}
${indent}columns: ${matrix2.columns}
}`;
      }
      function inspectData(matrix2, maxRows, maxColumns, maxNumSize, padMinus) {
        const { rows, columns } = matrix2;
        const maxI = Math.min(rows, maxRows);
        const maxJ = Math.min(columns, maxColumns);
        const result = [];
        if (padMinus === "auto") {
          padMinus = false;
          loop: for (let i = 0; i < maxI; i++) {
            for (let j = 0; j < maxJ; j++) {
              if (matrix2.get(i, j) < 0) {
                padMinus = true;
                break loop;
              }
            }
          }
        }
        for (let i = 0; i < maxI; i++) {
          let line = [];
          for (let j = 0; j < maxJ; j++) {
            line.push(formatNumber(matrix2.get(i, j), maxNumSize, padMinus));
          }
          result.push(`${line.join(" ")}`);
        }
        if (maxJ !== columns) {
          result[result.length - 1] += ` ... ${columns - maxColumns} more columns`;
        }
        if (maxI !== rows) {
          result.push(`... ${rows - maxRows} more rows`);
        }
        return result.join(`
${indentData}`);
      }
      function formatNumber(num, maxNumSize, padMinus) {
        return (num >= 0 && padMinus ? ` ${formatNumber2(num, maxNumSize - 1)}` : formatNumber2(num, maxNumSize)).padEnd(maxNumSize);
      }
      function formatNumber2(num, len) {
        let str = num.toString();
        if (str.length <= len) return str;
        let fix = num.toFixed(len);
        if (fix.length > len) {
          fix = num.toFixed(Math.max(0, len - (fix.length - len)));
        }
        if (fix.length <= len && !fix.startsWith("0.000") && !fix.startsWith("-0.000")) {
          return fix;
        }
        let exp = num.toExponential(len);
        if (exp.length > len) {
          exp = num.toExponential(Math.max(0, len - (exp.length - len)));
        }
        return exp.slice(0);
      }
      function installMathOperations(AbstractMatrix3, Matrix4) {
        AbstractMatrix3.prototype.add = function add(value) {
          if (typeof value === "number") return this.addS(value);
          return this.addM(value);
        };
        AbstractMatrix3.prototype.addS = function addS(value) {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) + value);
            }
          }
          return this;
        };
        AbstractMatrix3.prototype.addM = function addM(matrix2) {
          matrix2 = Matrix4.checkMatrix(matrix2);
          if (this.rows !== matrix2.rows || this.columns !== matrix2.columns) {
            throw new RangeError("Matrices dimensions must be equal");
          }
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) + matrix2.get(i, j));
            }
          }
          return this;
        };
        AbstractMatrix3.add = function add(matrix2, value) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.add(value);
        };
        AbstractMatrix3.prototype.sub = function sub(value) {
          if (typeof value === "number") return this.subS(value);
          return this.subM(value);
        };
        AbstractMatrix3.prototype.subS = function subS(value) {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) - value);
            }
          }
          return this;
        };
        AbstractMatrix3.prototype.subM = function subM(matrix2) {
          matrix2 = Matrix4.checkMatrix(matrix2);
          if (this.rows !== matrix2.rows || this.columns !== matrix2.columns) {
            throw new RangeError("Matrices dimensions must be equal");
          }
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) - matrix2.get(i, j));
            }
          }
          return this;
        };
        AbstractMatrix3.sub = function sub(matrix2, value) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.sub(value);
        };
        AbstractMatrix3.prototype.subtract = AbstractMatrix3.prototype.sub;
        AbstractMatrix3.prototype.subtractS = AbstractMatrix3.prototype.subS;
        AbstractMatrix3.prototype.subtractM = AbstractMatrix3.prototype.subM;
        AbstractMatrix3.subtract = AbstractMatrix3.sub;
        AbstractMatrix3.prototype.mul = function mul(value) {
          if (typeof value === "number") return this.mulS(value);
          return this.mulM(value);
        };
        AbstractMatrix3.prototype.mulS = function mulS(value) {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) * value);
            }
          }
          return this;
        };
        AbstractMatrix3.prototype.mulM = function mulM(matrix2) {
          matrix2 = Matrix4.checkMatrix(matrix2);
          if (this.rows !== matrix2.rows || this.columns !== matrix2.columns) {
            throw new RangeError("Matrices dimensions must be equal");
          }
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) * matrix2.get(i, j));
            }
          }
          return this;
        };
        AbstractMatrix3.mul = function mul(matrix2, value) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.mul(value);
        };
        AbstractMatrix3.prototype.multiply = AbstractMatrix3.prototype.mul;
        AbstractMatrix3.prototype.multiplyS = AbstractMatrix3.prototype.mulS;
        AbstractMatrix3.prototype.multiplyM = AbstractMatrix3.prototype.mulM;
        AbstractMatrix3.multiply = AbstractMatrix3.mul;
        AbstractMatrix3.prototype.div = function div(value) {
          if (typeof value === "number") return this.divS(value);
          return this.divM(value);
        };
        AbstractMatrix3.prototype.divS = function divS(value) {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) / value);
            }
          }
          return this;
        };
        AbstractMatrix3.prototype.divM = function divM(matrix2) {
          matrix2 = Matrix4.checkMatrix(matrix2);
          if (this.rows !== matrix2.rows || this.columns !== matrix2.columns) {
            throw new RangeError("Matrices dimensions must be equal");
          }
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) / matrix2.get(i, j));
            }
          }
          return this;
        };
        AbstractMatrix3.div = function div(matrix2, value) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.div(value);
        };
        AbstractMatrix3.prototype.divide = AbstractMatrix3.prototype.div;
        AbstractMatrix3.prototype.divideS = AbstractMatrix3.prototype.divS;
        AbstractMatrix3.prototype.divideM = AbstractMatrix3.prototype.divM;
        AbstractMatrix3.divide = AbstractMatrix3.div;
        AbstractMatrix3.prototype.mod = function mod(value) {
          if (typeof value === "number") return this.modS(value);
          return this.modM(value);
        };
        AbstractMatrix3.prototype.modS = function modS(value) {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) % value);
            }
          }
          return this;
        };
        AbstractMatrix3.prototype.modM = function modM(matrix2) {
          matrix2 = Matrix4.checkMatrix(matrix2);
          if (this.rows !== matrix2.rows || this.columns !== matrix2.columns) {
            throw new RangeError("Matrices dimensions must be equal");
          }
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) % matrix2.get(i, j));
            }
          }
          return this;
        };
        AbstractMatrix3.mod = function mod(matrix2, value) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.mod(value);
        };
        AbstractMatrix3.prototype.modulus = AbstractMatrix3.prototype.mod;
        AbstractMatrix3.prototype.modulusS = AbstractMatrix3.prototype.modS;
        AbstractMatrix3.prototype.modulusM = AbstractMatrix3.prototype.modM;
        AbstractMatrix3.modulus = AbstractMatrix3.mod;
        AbstractMatrix3.prototype.and = function and(value) {
          if (typeof value === "number") return this.andS(value);
          return this.andM(value);
        };
        AbstractMatrix3.prototype.andS = function andS(value) {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) & value);
            }
          }
          return this;
        };
        AbstractMatrix3.prototype.andM = function andM(matrix2) {
          matrix2 = Matrix4.checkMatrix(matrix2);
          if (this.rows !== matrix2.rows || this.columns !== matrix2.columns) {
            throw new RangeError("Matrices dimensions must be equal");
          }
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) & matrix2.get(i, j));
            }
          }
          return this;
        };
        AbstractMatrix3.and = function and(matrix2, value) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.and(value);
        };
        AbstractMatrix3.prototype.or = function or(value) {
          if (typeof value === "number") return this.orS(value);
          return this.orM(value);
        };
        AbstractMatrix3.prototype.orS = function orS(value) {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) | value);
            }
          }
          return this;
        };
        AbstractMatrix3.prototype.orM = function orM(matrix2) {
          matrix2 = Matrix4.checkMatrix(matrix2);
          if (this.rows !== matrix2.rows || this.columns !== matrix2.columns) {
            throw new RangeError("Matrices dimensions must be equal");
          }
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) | matrix2.get(i, j));
            }
          }
          return this;
        };
        AbstractMatrix3.or = function or(matrix2, value) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.or(value);
        };
        AbstractMatrix3.prototype.xor = function xor(value) {
          if (typeof value === "number") return this.xorS(value);
          return this.xorM(value);
        };
        AbstractMatrix3.prototype.xorS = function xorS(value) {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) ^ value);
            }
          }
          return this;
        };
        AbstractMatrix3.prototype.xorM = function xorM(matrix2) {
          matrix2 = Matrix4.checkMatrix(matrix2);
          if (this.rows !== matrix2.rows || this.columns !== matrix2.columns) {
            throw new RangeError("Matrices dimensions must be equal");
          }
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) ^ matrix2.get(i, j));
            }
          }
          return this;
        };
        AbstractMatrix3.xor = function xor(matrix2, value) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.xor(value);
        };
        AbstractMatrix3.prototype.leftShift = function leftShift(value) {
          if (typeof value === "number") return this.leftShiftS(value);
          return this.leftShiftM(value);
        };
        AbstractMatrix3.prototype.leftShiftS = function leftShiftS(value) {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) << value);
            }
          }
          return this;
        };
        AbstractMatrix3.prototype.leftShiftM = function leftShiftM(matrix2) {
          matrix2 = Matrix4.checkMatrix(matrix2);
          if (this.rows !== matrix2.rows || this.columns !== matrix2.columns) {
            throw new RangeError("Matrices dimensions must be equal");
          }
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) << matrix2.get(i, j));
            }
          }
          return this;
        };
        AbstractMatrix3.leftShift = function leftShift(matrix2, value) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.leftShift(value);
        };
        AbstractMatrix3.prototype.signPropagatingRightShift = function signPropagatingRightShift(value) {
          if (typeof value === "number") return this.signPropagatingRightShiftS(value);
          return this.signPropagatingRightShiftM(value);
        };
        AbstractMatrix3.prototype.signPropagatingRightShiftS = function signPropagatingRightShiftS(value) {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) >> value);
            }
          }
          return this;
        };
        AbstractMatrix3.prototype.signPropagatingRightShiftM = function signPropagatingRightShiftM(matrix2) {
          matrix2 = Matrix4.checkMatrix(matrix2);
          if (this.rows !== matrix2.rows || this.columns !== matrix2.columns) {
            throw new RangeError("Matrices dimensions must be equal");
          }
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) >> matrix2.get(i, j));
            }
          }
          return this;
        };
        AbstractMatrix3.signPropagatingRightShift = function signPropagatingRightShift(matrix2, value) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.signPropagatingRightShift(value);
        };
        AbstractMatrix3.prototype.rightShift = function rightShift(value) {
          if (typeof value === "number") return this.rightShiftS(value);
          return this.rightShiftM(value);
        };
        AbstractMatrix3.prototype.rightShiftS = function rightShiftS(value) {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) >>> value);
            }
          }
          return this;
        };
        AbstractMatrix3.prototype.rightShiftM = function rightShiftM(matrix2) {
          matrix2 = Matrix4.checkMatrix(matrix2);
          if (this.rows !== matrix2.rows || this.columns !== matrix2.columns) {
            throw new RangeError("Matrices dimensions must be equal");
          }
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) >>> matrix2.get(i, j));
            }
          }
          return this;
        };
        AbstractMatrix3.rightShift = function rightShift(matrix2, value) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.rightShift(value);
        };
        AbstractMatrix3.prototype.zeroFillRightShift = AbstractMatrix3.prototype.rightShift;
        AbstractMatrix3.prototype.zeroFillRightShiftS = AbstractMatrix3.prototype.rightShiftS;
        AbstractMatrix3.prototype.zeroFillRightShiftM = AbstractMatrix3.prototype.rightShiftM;
        AbstractMatrix3.zeroFillRightShift = AbstractMatrix3.rightShift;
        AbstractMatrix3.prototype.not = function not() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, ~this.get(i, j));
            }
          }
          return this;
        };
        AbstractMatrix3.not = function not(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.not();
        };
        AbstractMatrix3.prototype.abs = function abs() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.abs(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.abs = function abs(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.abs();
        };
        AbstractMatrix3.prototype.acos = function acos() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.acos(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.acos = function acos(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.acos();
        };
        AbstractMatrix3.prototype.acosh = function acosh() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.acosh(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.acosh = function acosh(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.acosh();
        };
        AbstractMatrix3.prototype.asin = function asin() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.asin(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.asin = function asin(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.asin();
        };
        AbstractMatrix3.prototype.asinh = function asinh() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.asinh(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.asinh = function asinh(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.asinh();
        };
        AbstractMatrix3.prototype.atan = function atan() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.atan(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.atan = function atan(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.atan();
        };
        AbstractMatrix3.prototype.atanh = function atanh() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.atanh(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.atanh = function atanh(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.atanh();
        };
        AbstractMatrix3.prototype.cbrt = function cbrt() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.cbrt(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.cbrt = function cbrt(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.cbrt();
        };
        AbstractMatrix3.prototype.ceil = function ceil() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.ceil(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.ceil = function ceil(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.ceil();
        };
        AbstractMatrix3.prototype.clz32 = function clz32() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.clz32(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.clz32 = function clz32(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.clz32();
        };
        AbstractMatrix3.prototype.cos = function cos() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.cos(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.cos = function cos(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.cos();
        };
        AbstractMatrix3.prototype.cosh = function cosh() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.cosh(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.cosh = function cosh(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.cosh();
        };
        AbstractMatrix3.prototype.exp = function exp() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.exp(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.exp = function exp(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.exp();
        };
        AbstractMatrix3.prototype.expm1 = function expm1() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.expm1(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.expm1 = function expm1(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.expm1();
        };
        AbstractMatrix3.prototype.floor = function floor() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.floor(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.floor = function floor(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.floor();
        };
        AbstractMatrix3.prototype.fround = function fround() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.fround(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.fround = function fround(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.fround();
        };
        AbstractMatrix3.prototype.log = function log() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.log(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.log = function log(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.log();
        };
        AbstractMatrix3.prototype.log1p = function log1p() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.log1p(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.log1p = function log1p(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.log1p();
        };
        AbstractMatrix3.prototype.log10 = function log10() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.log10(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.log10 = function log10(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.log10();
        };
        AbstractMatrix3.prototype.log2 = function log2() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.log2(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.log2 = function log2(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.log2();
        };
        AbstractMatrix3.prototype.round = function round() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.round(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.round = function round(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.round();
        };
        AbstractMatrix3.prototype.sign = function sign() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.sign(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.sign = function sign(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.sign();
        };
        AbstractMatrix3.prototype.sin = function sin() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.sin(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.sin = function sin(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.sin();
        };
        AbstractMatrix3.prototype.sinh = function sinh() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.sinh(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.sinh = function sinh(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.sinh();
        };
        AbstractMatrix3.prototype.sqrt = function sqrt() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.sqrt(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.sqrt = function sqrt(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.sqrt();
        };
        AbstractMatrix3.prototype.tan = function tan() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.tan(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.tan = function tan(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.tan();
        };
        AbstractMatrix3.prototype.tanh = function tanh() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.tanh(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.tanh = function tanh(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.tanh();
        };
        AbstractMatrix3.prototype.trunc = function trunc() {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, Math.trunc(this.get(i, j)));
            }
          }
          return this;
        };
        AbstractMatrix3.trunc = function trunc(matrix2) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.trunc();
        };
        AbstractMatrix3.pow = function pow(matrix2, arg0) {
          const newMatrix = new Matrix4(matrix2);
          return newMatrix.pow(arg0);
        };
        AbstractMatrix3.prototype.pow = function pow(value) {
          if (typeof value === "number") return this.powS(value);
          return this.powM(value);
        };
        AbstractMatrix3.prototype.powS = function powS(value) {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) ** value);
            }
          }
          return this;
        };
        AbstractMatrix3.prototype.powM = function powM(matrix2) {
          matrix2 = Matrix4.checkMatrix(matrix2);
          if (this.rows !== matrix2.rows || this.columns !== matrix2.columns) {
            throw new RangeError("Matrices dimensions must be equal");
          }
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) ** matrix2.get(i, j));
            }
          }
          return this;
        };
      }
      function checkRowIndex(matrix2, index, outer) {
        let max2 = outer ? matrix2.rows : matrix2.rows - 1;
        if (index < 0 || index > max2) {
          throw new RangeError("Row index out of range");
        }
      }
      function checkColumnIndex(matrix2, index, outer) {
        let max2 = outer ? matrix2.columns : matrix2.columns - 1;
        if (index < 0 || index > max2) {
          throw new RangeError("Column index out of range");
        }
      }
      function checkRowVector(matrix2, vector) {
        if (vector.to1DArray) {
          vector = vector.to1DArray();
        }
        if (vector.length !== matrix2.columns) {
          throw new RangeError(
            "vector size must be the same as the number of columns"
          );
        }
        return vector;
      }
      function checkColumnVector(matrix2, vector) {
        if (vector.to1DArray) {
          vector = vector.to1DArray();
        }
        if (vector.length !== matrix2.rows) {
          throw new RangeError("vector size must be the same as the number of rows");
        }
        return vector;
      }
      function checkRowIndices(matrix2, rowIndices) {
        if (!isAnyArray(rowIndices)) {
          throw new TypeError("row indices must be an array");
        }
        for (let i = 0; i < rowIndices.length; i++) {
          if (rowIndices[i] < 0 || rowIndices[i] >= matrix2.rows) {
            throw new RangeError("row indices are out of range");
          }
        }
      }
      function checkColumnIndices(matrix2, columnIndices) {
        if (!isAnyArray(columnIndices)) {
          throw new TypeError("column indices must be an array");
        }
        for (let i = 0; i < columnIndices.length; i++) {
          if (columnIndices[i] < 0 || columnIndices[i] >= matrix2.columns) {
            throw new RangeError("column indices are out of range");
          }
        }
      }
      function checkRange(matrix2, startRow, endRow, startColumn, endColumn) {
        if (arguments.length !== 5) {
          throw new RangeError("expected 4 arguments");
        }
        checkNumber("startRow", startRow);
        checkNumber("endRow", endRow);
        checkNumber("startColumn", startColumn);
        checkNumber("endColumn", endColumn);
        if (startRow > endRow || startColumn > endColumn || startRow < 0 || startRow >= matrix2.rows || endRow < 0 || endRow >= matrix2.rows || startColumn < 0 || startColumn >= matrix2.columns || endColumn < 0 || endColumn >= matrix2.columns) {
          throw new RangeError("Submatrix indices are out of range");
        }
      }
      function newArray(length, value = 0) {
        let array = [];
        for (let i = 0; i < length; i++) {
          array.push(value);
        }
        return array;
      }
      function checkNumber(name, value) {
        if (typeof value !== "number") {
          throw new TypeError(`${name} must be a number`);
        }
      }
      function checkNonEmpty(matrix2) {
        if (matrix2.isEmpty()) {
          throw new Error("Empty matrix has no elements to index");
        }
      }
      function sumByRow(matrix2) {
        let sum2 = newArray(matrix2.rows);
        for (let i = 0; i < matrix2.rows; ++i) {
          for (let j = 0; j < matrix2.columns; ++j) {
            sum2[i] += matrix2.get(i, j);
          }
        }
        return sum2;
      }
      function sumByColumn(matrix2) {
        let sum2 = newArray(matrix2.columns);
        for (let i = 0; i < matrix2.rows; ++i) {
          for (let j = 0; j < matrix2.columns; ++j) {
            sum2[j] += matrix2.get(i, j);
          }
        }
        return sum2;
      }
      function sumAll(matrix2) {
        let v = 0;
        for (let i = 0; i < matrix2.rows; i++) {
          for (let j = 0; j < matrix2.columns; j++) {
            v += matrix2.get(i, j);
          }
        }
        return v;
      }
      function productByRow(matrix2) {
        let sum2 = newArray(matrix2.rows, 1);
        for (let i = 0; i < matrix2.rows; ++i) {
          for (let j = 0; j < matrix2.columns; ++j) {
            sum2[i] *= matrix2.get(i, j);
          }
        }
        return sum2;
      }
      function productByColumn(matrix2) {
        let sum2 = newArray(matrix2.columns, 1);
        for (let i = 0; i < matrix2.rows; ++i) {
          for (let j = 0; j < matrix2.columns; ++j) {
            sum2[j] *= matrix2.get(i, j);
          }
        }
        return sum2;
      }
      function productAll(matrix2) {
        let v = 1;
        for (let i = 0; i < matrix2.rows; i++) {
          for (let j = 0; j < matrix2.columns; j++) {
            v *= matrix2.get(i, j);
          }
        }
        return v;
      }
      function varianceByRow(matrix2, unbiased, mean) {
        const rows = matrix2.rows;
        const cols = matrix2.columns;
        const variance = [];
        for (let i = 0; i < rows; i++) {
          let sum1 = 0;
          let sum2 = 0;
          let x = 0;
          for (let j = 0; j < cols; j++) {
            x = matrix2.get(i, j) - mean[i];
            sum1 += x;
            sum2 += x * x;
          }
          if (unbiased) {
            variance.push((sum2 - sum1 * sum1 / cols) / (cols - 1));
          } else {
            variance.push((sum2 - sum1 * sum1 / cols) / cols);
          }
        }
        return variance;
      }
      function varianceByColumn(matrix2, unbiased, mean) {
        const rows = matrix2.rows;
        const cols = matrix2.columns;
        const variance = [];
        for (let j = 0; j < cols; j++) {
          let sum1 = 0;
          let sum2 = 0;
          let x = 0;
          for (let i = 0; i < rows; i++) {
            x = matrix2.get(i, j) - mean[j];
            sum1 += x;
            sum2 += x * x;
          }
          if (unbiased) {
            variance.push((sum2 - sum1 * sum1 / rows) / (rows - 1));
          } else {
            variance.push((sum2 - sum1 * sum1 / rows) / rows);
          }
        }
        return variance;
      }
      function varianceAll(matrix2, unbiased, mean) {
        const rows = matrix2.rows;
        const cols = matrix2.columns;
        const size = rows * cols;
        let sum1 = 0;
        let sum2 = 0;
        let x = 0;
        for (let i = 0; i < rows; i++) {
          for (let j = 0; j < cols; j++) {
            x = matrix2.get(i, j) - mean;
            sum1 += x;
            sum2 += x * x;
          }
        }
        if (unbiased) {
          return (sum2 - sum1 * sum1 / size) / (size - 1);
        } else {
          return (sum2 - sum1 * sum1 / size) / size;
        }
      }
      function centerByRow(matrix2, mean) {
        for (let i = 0; i < matrix2.rows; i++) {
          for (let j = 0; j < matrix2.columns; j++) {
            matrix2.set(i, j, matrix2.get(i, j) - mean[i]);
          }
        }
      }
      function centerByColumn(matrix2, mean) {
        for (let i = 0; i < matrix2.rows; i++) {
          for (let j = 0; j < matrix2.columns; j++) {
            matrix2.set(i, j, matrix2.get(i, j) - mean[j]);
          }
        }
      }
      function centerAll(matrix2, mean) {
        for (let i = 0; i < matrix2.rows; i++) {
          for (let j = 0; j < matrix2.columns; j++) {
            matrix2.set(i, j, matrix2.get(i, j) - mean);
          }
        }
      }
      function getScaleByRow(matrix2) {
        const scale = [];
        for (let i = 0; i < matrix2.rows; i++) {
          let sum2 = 0;
          for (let j = 0; j < matrix2.columns; j++) {
            sum2 += matrix2.get(i, j) ** 2 / (matrix2.columns - 1);
          }
          scale.push(Math.sqrt(sum2));
        }
        return scale;
      }
      function scaleByRow(matrix2, scale) {
        for (let i = 0; i < matrix2.rows; i++) {
          for (let j = 0; j < matrix2.columns; j++) {
            matrix2.set(i, j, matrix2.get(i, j) / scale[i]);
          }
        }
      }
      function getScaleByColumn(matrix2) {
        const scale = [];
        for (let j = 0; j < matrix2.columns; j++) {
          let sum2 = 0;
          for (let i = 0; i < matrix2.rows; i++) {
            sum2 += matrix2.get(i, j) ** 2 / (matrix2.rows - 1);
          }
          scale.push(Math.sqrt(sum2));
        }
        return scale;
      }
      function scaleByColumn(matrix2, scale) {
        for (let i = 0; i < matrix2.rows; i++) {
          for (let j = 0; j < matrix2.columns; j++) {
            matrix2.set(i, j, matrix2.get(i, j) / scale[j]);
          }
        }
      }
      function getScaleAll(matrix2) {
        const divider = matrix2.size - 1;
        let sum2 = 0;
        for (let j = 0; j < matrix2.columns; j++) {
          for (let i = 0; i < matrix2.rows; i++) {
            sum2 += matrix2.get(i, j) ** 2 / divider;
          }
        }
        return Math.sqrt(sum2);
      }
      function scaleAll(matrix2, scale) {
        for (let i = 0; i < matrix2.rows; i++) {
          for (let j = 0; j < matrix2.columns; j++) {
            matrix2.set(i, j, matrix2.get(i, j) / scale);
          }
        }
      }
      var AbstractMatrix2 = class _AbstractMatrix {
        static from1DArray(newRows, newColumns, newData) {
          let length = newRows * newColumns;
          if (length !== newData.length) {
            throw new RangeError("data length does not match given dimensions");
          }
          let newMatrix = new Matrix3(newRows, newColumns);
          for (let row = 0; row < newRows; row++) {
            for (let column = 0; column < newColumns; column++) {
              newMatrix.set(row, column, newData[row * newColumns + column]);
            }
          }
          return newMatrix;
        }
        static rowVector(newData) {
          let vector = new Matrix3(1, newData.length);
          for (let i = 0; i < newData.length; i++) {
            vector.set(0, i, newData[i]);
          }
          return vector;
        }
        static columnVector(newData) {
          let vector = new Matrix3(newData.length, 1);
          for (let i = 0; i < newData.length; i++) {
            vector.set(i, 0, newData[i]);
          }
          return vector;
        }
        static zeros(rows, columns) {
          return new Matrix3(rows, columns);
        }
        static ones(rows, columns) {
          return new Matrix3(rows, columns).fill(1);
        }
        static rand(rows, columns, options = {}) {
          if (typeof options !== "object") {
            throw new TypeError("options must be an object");
          }
          const { random = Math.random } = options;
          let matrix2 = new Matrix3(rows, columns);
          for (let i = 0; i < rows; i++) {
            for (let j = 0; j < columns; j++) {
              matrix2.set(i, j, random());
            }
          }
          return matrix2;
        }
        static randInt(rows, columns, options = {}) {
          if (typeof options !== "object") {
            throw new TypeError("options must be an object");
          }
          const { min: min2 = 0, max: max2 = 1e3, random = Math.random } = options;
          if (!Number.isInteger(min2)) throw new TypeError("min must be an integer");
          if (!Number.isInteger(max2)) throw new TypeError("max must be an integer");
          if (min2 >= max2) throw new RangeError("min must be smaller than max");
          let interval = max2 - min2;
          let matrix2 = new Matrix3(rows, columns);
          for (let i = 0; i < rows; i++) {
            for (let j = 0; j < columns; j++) {
              let value = min2 + Math.round(random() * interval);
              matrix2.set(i, j, value);
            }
          }
          return matrix2;
        }
        static eye(rows, columns, value) {
          if (columns === void 0) columns = rows;
          if (value === void 0) value = 1;
          let min2 = Math.min(rows, columns);
          let matrix2 = this.zeros(rows, columns);
          for (let i = 0; i < min2; i++) {
            matrix2.set(i, i, value);
          }
          return matrix2;
        }
        static diag(data, rows, columns) {
          let l = data.length;
          if (rows === void 0) rows = l;
          if (columns === void 0) columns = rows;
          let min2 = Math.min(l, rows, columns);
          let matrix2 = this.zeros(rows, columns);
          for (let i = 0; i < min2; i++) {
            matrix2.set(i, i, data[i]);
          }
          return matrix2;
        }
        static min(matrix1, matrix2) {
          matrix1 = this.checkMatrix(matrix1);
          matrix2 = this.checkMatrix(matrix2);
          let rows = matrix1.rows;
          let columns = matrix1.columns;
          let result = new Matrix3(rows, columns);
          for (let i = 0; i < rows; i++) {
            for (let j = 0; j < columns; j++) {
              result.set(i, j, Math.min(matrix1.get(i, j), matrix2.get(i, j)));
            }
          }
          return result;
        }
        static max(matrix1, matrix2) {
          matrix1 = this.checkMatrix(matrix1);
          matrix2 = this.checkMatrix(matrix2);
          let rows = matrix1.rows;
          let columns = matrix1.columns;
          let result = new this(rows, columns);
          for (let i = 0; i < rows; i++) {
            for (let j = 0; j < columns; j++) {
              result.set(i, j, Math.max(matrix1.get(i, j), matrix2.get(i, j)));
            }
          }
          return result;
        }
        static checkMatrix(value) {
          return _AbstractMatrix.isMatrix(value) ? value : new Matrix3(value);
        }
        static isMatrix(value) {
          return value != null && value.klass === "Matrix";
        }
        get size() {
          return this.rows * this.columns;
        }
        apply(callback) {
          if (typeof callback !== "function") {
            throw new TypeError("callback must be a function");
          }
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              callback.call(this, i, j);
            }
          }
          return this;
        }
        applyAlongAxis(callback, by) {
          if (typeof callback !== "function") {
            throw new TypeError("callback must be a function");
          }
          const result = [];
          switch (by) {
            case "row": {
              for (let i = 0; i < this.rows; i++) {
                result.push(callback.call(this, this.getRow(i), i));
              }
              break;
            }
            case "column": {
              for (let i = 0; i < this.columns; i++) {
                result.push(callback.call(this, this.getColumn(i), i));
              }
              break;
            }
            default:
              throw new Error(`invalid option: ${by}`);
          }
          return result;
        }
        to1DArray() {
          let array = [];
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              array.push(this.get(i, j));
            }
          }
          return array;
        }
        to2DArray() {
          let copy = [];
          for (let i = 0; i < this.rows; i++) {
            copy.push([]);
            for (let j = 0; j < this.columns; j++) {
              copy[i].push(this.get(i, j));
            }
          }
          return copy;
        }
        toJSON() {
          return this.to2DArray();
        }
        isRowVector() {
          return this.rows === 1;
        }
        isColumnVector() {
          return this.columns === 1;
        }
        isVector() {
          return this.rows === 1 || this.columns === 1;
        }
        isSquare() {
          return this.rows === this.columns;
        }
        isEmpty() {
          return this.rows === 0 || this.columns === 0;
        }
        isSymmetric() {
          if (this.isSquare()) {
            for (let i = 0; i < this.rows; i++) {
              for (let j = 0; j <= i; j++) {
                if (this.get(i, j) !== this.get(j, i)) {
                  return false;
                }
              }
            }
            return true;
          }
          return false;
        }
        isDistance() {
          if (!this.isSymmetric()) return false;
          for (let i = 0; i < this.rows; i++) {
            if (this.get(i, i) !== 0) return false;
          }
          return true;
        }
        isEchelonForm() {
          let i = 0;
          let j = 0;
          let previousColumn = -1;
          let isEchelonForm = true;
          let checked = false;
          while (i < this.rows && isEchelonForm) {
            j = 0;
            checked = false;
            while (j < this.columns && checked === false) {
              if (this.get(i, j) === 0) {
                j++;
              } else if (this.get(i, j) === 1 && j > previousColumn) {
                checked = true;
                previousColumn = j;
              } else {
                isEchelonForm = false;
                checked = true;
              }
            }
            i++;
          }
          return isEchelonForm;
        }
        isReducedEchelonForm() {
          let i = 0;
          let j = 0;
          let previousColumn = -1;
          let isReducedEchelonForm = true;
          let checked = false;
          while (i < this.rows && isReducedEchelonForm) {
            j = 0;
            checked = false;
            while (j < this.columns && checked === false) {
              if (this.get(i, j) === 0) {
                j++;
              } else if (this.get(i, j) === 1 && j > previousColumn) {
                checked = true;
                previousColumn = j;
              } else {
                isReducedEchelonForm = false;
                checked = true;
              }
            }
            for (let k = j + 1; k < this.rows; k++) {
              if (this.get(i, k) !== 0) {
                isReducedEchelonForm = false;
              }
            }
            i++;
          }
          return isReducedEchelonForm;
        }
        echelonForm() {
          let result = this.clone();
          let h = 0;
          let k = 0;
          while (h < result.rows && k < result.columns) {
            let iMax = h;
            for (let i = h; i < result.rows; i++) {
              if (result.get(i, k) > result.get(iMax, k)) {
                iMax = i;
              }
            }
            if (result.get(iMax, k) === 0) {
              k++;
            } else {
              result.swapRows(h, iMax);
              let tmp = result.get(h, k);
              for (let j = k; j < result.columns; j++) {
                result.set(h, j, result.get(h, j) / tmp);
              }
              for (let i = h + 1; i < result.rows; i++) {
                let factor = result.get(i, k) / result.get(h, k);
                result.set(i, k, 0);
                for (let j = k + 1; j < result.columns; j++) {
                  result.set(i, j, result.get(i, j) - result.get(h, j) * factor);
                }
              }
              h++;
              k++;
            }
          }
          return result;
        }
        reducedEchelonForm() {
          let result = this.echelonForm();
          let m = result.columns;
          let n = result.rows;
          let h = n - 1;
          while (h >= 0) {
            if (result.maxRow(h) === 0) {
              h--;
            } else {
              let p = 0;
              let pivot = false;
              while (p < n && pivot === false) {
                if (result.get(h, p) === 1) {
                  pivot = true;
                } else {
                  p++;
                }
              }
              for (let i = 0; i < h; i++) {
                let factor = result.get(i, p);
                for (let j = p; j < m; j++) {
                  let tmp = result.get(i, j) - factor * result.get(h, j);
                  result.set(i, j, tmp);
                }
              }
              h--;
            }
          }
          return result;
        }
        set() {
          throw new Error("set method is unimplemented");
        }
        get() {
          throw new Error("get method is unimplemented");
        }
        repeat(options = {}) {
          if (typeof options !== "object") {
            throw new TypeError("options must be an object");
          }
          const { rows = 1, columns = 1 } = options;
          if (!Number.isInteger(rows) || rows <= 0) {
            throw new TypeError("rows must be a positive integer");
          }
          if (!Number.isInteger(columns) || columns <= 0) {
            throw new TypeError("columns must be a positive integer");
          }
          let matrix2 = new Matrix3(this.rows * rows, this.columns * columns);
          for (let i = 0; i < rows; i++) {
            for (let j = 0; j < columns; j++) {
              matrix2.setSubMatrix(this, this.rows * i, this.columns * j);
            }
          }
          return matrix2;
        }
        fill(value) {
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, value);
            }
          }
          return this;
        }
        neg() {
          return this.mulS(-1);
        }
        getRow(index) {
          checkRowIndex(this, index);
          let row = [];
          for (let i = 0; i < this.columns; i++) {
            row.push(this.get(index, i));
          }
          return row;
        }
        getRowVector(index) {
          return Matrix3.rowVector(this.getRow(index));
        }
        setRow(index, array) {
          checkRowIndex(this, index);
          array = checkRowVector(this, array);
          for (let i = 0; i < this.columns; i++) {
            this.set(index, i, array[i]);
          }
          return this;
        }
        swapRows(row1, row2) {
          checkRowIndex(this, row1);
          checkRowIndex(this, row2);
          for (let i = 0; i < this.columns; i++) {
            let temp = this.get(row1, i);
            this.set(row1, i, this.get(row2, i));
            this.set(row2, i, temp);
          }
          return this;
        }
        getColumn(index) {
          checkColumnIndex(this, index);
          let column = [];
          for (let i = 0; i < this.rows; i++) {
            column.push(this.get(i, index));
          }
          return column;
        }
        getColumnVector(index) {
          return Matrix3.columnVector(this.getColumn(index));
        }
        setColumn(index, array) {
          checkColumnIndex(this, index);
          array = checkColumnVector(this, array);
          for (let i = 0; i < this.rows; i++) {
            this.set(i, index, array[i]);
          }
          return this;
        }
        swapColumns(column1, column2) {
          checkColumnIndex(this, column1);
          checkColumnIndex(this, column2);
          for (let i = 0; i < this.rows; i++) {
            let temp = this.get(i, column1);
            this.set(i, column1, this.get(i, column2));
            this.set(i, column2, temp);
          }
          return this;
        }
        addRowVector(vector) {
          vector = checkRowVector(this, vector);
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) + vector[j]);
            }
          }
          return this;
        }
        subRowVector(vector) {
          vector = checkRowVector(this, vector);
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) - vector[j]);
            }
          }
          return this;
        }
        mulRowVector(vector) {
          vector = checkRowVector(this, vector);
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) * vector[j]);
            }
          }
          return this;
        }
        divRowVector(vector) {
          vector = checkRowVector(this, vector);
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) / vector[j]);
            }
          }
          return this;
        }
        addColumnVector(vector) {
          vector = checkColumnVector(this, vector);
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) + vector[i]);
            }
          }
          return this;
        }
        subColumnVector(vector) {
          vector = checkColumnVector(this, vector);
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) - vector[i]);
            }
          }
          return this;
        }
        mulColumnVector(vector) {
          vector = checkColumnVector(this, vector);
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) * vector[i]);
            }
          }
          return this;
        }
        divColumnVector(vector) {
          vector = checkColumnVector(this, vector);
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              this.set(i, j, this.get(i, j) / vector[i]);
            }
          }
          return this;
        }
        mulRow(index, value) {
          checkRowIndex(this, index);
          for (let i = 0; i < this.columns; i++) {
            this.set(index, i, this.get(index, i) * value);
          }
          return this;
        }
        mulColumn(index, value) {
          checkColumnIndex(this, index);
          for (let i = 0; i < this.rows; i++) {
            this.set(i, index, this.get(i, index) * value);
          }
          return this;
        }
        max(by) {
          if (this.isEmpty()) {
            return NaN;
          }
          switch (by) {
            case "row": {
              const max2 = new Array(this.rows).fill(Number.NEGATIVE_INFINITY);
              for (let row = 0; row < this.rows; row++) {
                for (let column = 0; column < this.columns; column++) {
                  if (this.get(row, column) > max2[row]) {
                    max2[row] = this.get(row, column);
                  }
                }
              }
              return max2;
            }
            case "column": {
              const max2 = new Array(this.columns).fill(Number.NEGATIVE_INFINITY);
              for (let row = 0; row < this.rows; row++) {
                for (let column = 0; column < this.columns; column++) {
                  if (this.get(row, column) > max2[column]) {
                    max2[column] = this.get(row, column);
                  }
                }
              }
              return max2;
            }
            case void 0: {
              let max2 = this.get(0, 0);
              for (let row = 0; row < this.rows; row++) {
                for (let column = 0; column < this.columns; column++) {
                  if (this.get(row, column) > max2) {
                    max2 = this.get(row, column);
                  }
                }
              }
              return max2;
            }
            default:
              throw new Error(`invalid option: ${by}`);
          }
        }
        maxIndex() {
          checkNonEmpty(this);
          let v = this.get(0, 0);
          let idx = [0, 0];
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              if (this.get(i, j) > v) {
                v = this.get(i, j);
                idx[0] = i;
                idx[1] = j;
              }
            }
          }
          return idx;
        }
        min(by) {
          if (this.isEmpty()) {
            return NaN;
          }
          switch (by) {
            case "row": {
              const min2 = new Array(this.rows).fill(Number.POSITIVE_INFINITY);
              for (let row = 0; row < this.rows; row++) {
                for (let column = 0; column < this.columns; column++) {
                  if (this.get(row, column) < min2[row]) {
                    min2[row] = this.get(row, column);
                  }
                }
              }
              return min2;
            }
            case "column": {
              const min2 = new Array(this.columns).fill(Number.POSITIVE_INFINITY);
              for (let row = 0; row < this.rows; row++) {
                for (let column = 0; column < this.columns; column++) {
                  if (this.get(row, column) < min2[column]) {
                    min2[column] = this.get(row, column);
                  }
                }
              }
              return min2;
            }
            case void 0: {
              let min2 = this.get(0, 0);
              for (let row = 0; row < this.rows; row++) {
                for (let column = 0; column < this.columns; column++) {
                  if (this.get(row, column) < min2) {
                    min2 = this.get(row, column);
                  }
                }
              }
              return min2;
            }
            default:
              throw new Error(`invalid option: ${by}`);
          }
        }
        minIndex() {
          checkNonEmpty(this);
          let v = this.get(0, 0);
          let idx = [0, 0];
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              if (this.get(i, j) < v) {
                v = this.get(i, j);
                idx[0] = i;
                idx[1] = j;
              }
            }
          }
          return idx;
        }
        maxRow(row) {
          checkRowIndex(this, row);
          if (this.isEmpty()) {
            return NaN;
          }
          let v = this.get(row, 0);
          for (let i = 1; i < this.columns; i++) {
            if (this.get(row, i) > v) {
              v = this.get(row, i);
            }
          }
          return v;
        }
        maxRowIndex(row) {
          checkRowIndex(this, row);
          checkNonEmpty(this);
          let v = this.get(row, 0);
          let idx = [row, 0];
          for (let i = 1; i < this.columns; i++) {
            if (this.get(row, i) > v) {
              v = this.get(row, i);
              idx[1] = i;
            }
          }
          return idx;
        }
        minRow(row) {
          checkRowIndex(this, row);
          if (this.isEmpty()) {
            return NaN;
          }
          let v = this.get(row, 0);
          for (let i = 1; i < this.columns; i++) {
            if (this.get(row, i) < v) {
              v = this.get(row, i);
            }
          }
          return v;
        }
        minRowIndex(row) {
          checkRowIndex(this, row);
          checkNonEmpty(this);
          let v = this.get(row, 0);
          let idx = [row, 0];
          for (let i = 1; i < this.columns; i++) {
            if (this.get(row, i) < v) {
              v = this.get(row, i);
              idx[1] = i;
            }
          }
          return idx;
        }
        maxColumn(column) {
          checkColumnIndex(this, column);
          if (this.isEmpty()) {
            return NaN;
          }
          let v = this.get(0, column);
          for (let i = 1; i < this.rows; i++) {
            if (this.get(i, column) > v) {
              v = this.get(i, column);
            }
          }
          return v;
        }
        maxColumnIndex(column) {
          checkColumnIndex(this, column);
          checkNonEmpty(this);
          let v = this.get(0, column);
          let idx = [0, column];
          for (let i = 1; i < this.rows; i++) {
            if (this.get(i, column) > v) {
              v = this.get(i, column);
              idx[0] = i;
            }
          }
          return idx;
        }
        minColumn(column) {
          checkColumnIndex(this, column);
          if (this.isEmpty()) {
            return NaN;
          }
          let v = this.get(0, column);
          for (let i = 1; i < this.rows; i++) {
            if (this.get(i, column) < v) {
              v = this.get(i, column);
            }
          }
          return v;
        }
        minColumnIndex(column) {
          checkColumnIndex(this, column);
          checkNonEmpty(this);
          let v = this.get(0, column);
          let idx = [0, column];
          for (let i = 1; i < this.rows; i++) {
            if (this.get(i, column) < v) {
              v = this.get(i, column);
              idx[0] = i;
            }
          }
          return idx;
        }
        diag() {
          let min2 = Math.min(this.rows, this.columns);
          let diag = [];
          for (let i = 0; i < min2; i++) {
            diag.push(this.get(i, i));
          }
          return diag;
        }
        norm(type = "frobenius") {
          switch (type) {
            case "max":
              return this.max();
            case "frobenius":
              return Math.sqrt(this.dot(this));
            default:
              throw new RangeError(`unknown norm type: ${type}`);
          }
        }
        cumulativeSum() {
          let sum2 = 0;
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              sum2 += this.get(i, j);
              this.set(i, j, sum2);
            }
          }
          return this;
        }
        dot(vector2) {
          if (_AbstractMatrix.isMatrix(vector2)) vector2 = vector2.to1DArray();
          let vector1 = this.to1DArray();
          if (vector1.length !== vector2.length) {
            throw new RangeError("vectors do not have the same size");
          }
          let dot2 = 0;
          for (let i = 0; i < vector1.length; i++) {
            dot2 += vector1[i] * vector2[i];
          }
          return dot2;
        }
        mmul(other) {
          other = Matrix3.checkMatrix(other);
          let m = this.rows;
          let n = this.columns;
          let p = other.columns;
          let result = new Matrix3(m, p);
          let Bcolj = new Float64Array(n);
          for (let j = 0; j < p; j++) {
            for (let k = 0; k < n; k++) {
              Bcolj[k] = other.get(k, j);
            }
            for (let i = 0; i < m; i++) {
              let s = 0;
              for (let k = 0; k < n; k++) {
                s += this.get(i, k) * Bcolj[k];
              }
              result.set(i, j, s);
            }
          }
          return result;
        }
        gram() {
          const rows = this.rows;
          const n = this.columns;
          const gramData = new Float64Array(n * n);
          for (let r = 0; r < rows; r++) {
            for (let i = 0; i < n; i++) {
              const value = this.get(r, i);
              if (value === 0) continue;
              const offset = i * n;
              for (let j = i; j < n; j++) {
                gramData[offset + j] += value * this.get(r, j);
              }
            }
          }
          const result = new Matrix3(n, n);
          for (let i = 0; i < n; i++) {
            const offset = i * n;
            for (let j = i; j < n; j++) {
              const value = gramData[offset + j];
              result.set(i, j, value);
              result.set(j, i, value);
            }
          }
          return result;
        }
        transposeMultiply(other) {
          other = Matrix3.checkMatrix(other);
          if (this.rows !== other.rows) {
            throw new RangeError(
              "the number of rows of the two matrices must be equal"
            );
          }
          const n = this.columns;
          const p = other.columns;
          const result = new Matrix3(n, p);
          const otherRow = new Float64Array(p);
          for (let r = 0; r < this.rows; r++) {
            for (let j = 0; j < p; j++) {
              otherRow[j] = other.get(r, j);
            }
            for (let i = 0; i < n; i++) {
              const value = this.get(r, i);
              if (value === 0) continue;
              const resultRow = result.data[i];
              for (let j = 0; j < p; j++) {
                resultRow[j] += value * otherRow[j];
              }
            }
          }
          return result;
        }
        mmulByTranspose(scale) {
          let m = this.rows;
          let n = this.columns;
          if (scale !== void 0 && scale.length !== n) {
            throw new RangeError("scale must have one value per column");
          }
          let result = new Matrix3(m, m);
          let rowj = new Float64Array(n);
          for (let j = 0; j < m; j++) {
            if (scale === void 0) {
              for (let k = 0; k < n; k++) {
                rowj[k] = this.get(j, k);
              }
            } else {
              for (let k = 0; k < n; k++) {
                rowj[k] = scale[k] * this.get(j, k);
              }
            }
            for (let i = j; i < m; i++) {
              let s = 0;
              for (let k = 0; k < n; k++) {
                s += this.get(i, k) * rowj[k];
              }
              result.set(i, j, s);
              result.set(j, i, s);
            }
          }
          return result;
        }
        mpow(scalar) {
          if (!this.isSquare()) {
            throw new RangeError("Matrix must be square");
          }
          if (!Number.isInteger(scalar) || scalar < 0) {
            throw new RangeError("Exponent must be a non-negative integer");
          }
          let result = Matrix3.eye(this.rows);
          let bb = this;
          for (let e = scalar; e >= 1; e /= 2) {
            if ((e & 1) !== 0) {
              result = result.mmul(bb);
            }
            bb = bb.mmul(bb);
          }
          return result;
        }
        strassen2x2(other) {
          other = Matrix3.checkMatrix(other);
          let result = new Matrix3(2, 2);
          const a11 = this.get(0, 0);
          const b11 = other.get(0, 0);
          const a12 = this.get(0, 1);
          const b12 = other.get(0, 1);
          const a21 = this.get(1, 0);
          const b21 = other.get(1, 0);
          const a22 = this.get(1, 1);
          const b22 = other.get(1, 1);
          const m1 = (a11 + a22) * (b11 + b22);
          const m2 = (a21 + a22) * b11;
          const m3 = a11 * (b12 - b22);
          const m4 = a22 * (b21 - b11);
          const m5 = (a11 + a12) * b22;
          const m6 = (a21 - a11) * (b11 + b12);
          const m7 = (a12 - a22) * (b21 + b22);
          const c00 = m1 + m4 - m5 + m7;
          const c01 = m3 + m5;
          const c10 = m2 + m4;
          const c11 = m1 - m2 + m3 + m6;
          result.set(0, 0, c00);
          result.set(0, 1, c01);
          result.set(1, 0, c10);
          result.set(1, 1, c11);
          return result;
        }
        strassen3x3(other) {
          other = Matrix3.checkMatrix(other);
          let result = new Matrix3(3, 3);
          const a00 = this.get(0, 0);
          const a01 = this.get(0, 1);
          const a02 = this.get(0, 2);
          const a10 = this.get(1, 0);
          const a11 = this.get(1, 1);
          const a12 = this.get(1, 2);
          const a20 = this.get(2, 0);
          const a21 = this.get(2, 1);
          const a22 = this.get(2, 2);
          const b00 = other.get(0, 0);
          const b01 = other.get(0, 1);
          const b02 = other.get(0, 2);
          const b10 = other.get(1, 0);
          const b11 = other.get(1, 1);
          const b12 = other.get(1, 2);
          const b20 = other.get(2, 0);
          const b21 = other.get(2, 1);
          const b22 = other.get(2, 2);
          const m1 = (a00 + a01 + a02 - a10 - a11 - a21 - a22) * b11;
          const m2 = (a00 - a10) * (-b01 + b11);
          const m3 = a11 * (-b00 + b01 + b10 - b11 - b12 - b20 + b22);
          const m4 = (-a00 + a10 + a11) * (b00 - b01 + b11);
          const m5 = (a10 + a11) * (-b00 + b01);
          const m6 = a00 * b00;
          const m7 = (-a00 + a20 + a21) * (b00 - b02 + b12);
          const m8 = (-a00 + a20) * (b02 - b12);
          const m9 = (a20 + a21) * (-b00 + b02);
          const m10 = (a00 + a01 + a02 - a11 - a12 - a20 - a21) * b12;
          const m11 = a21 * (-b00 + b02 + b10 - b11 - b12 - b20 + b21);
          const m12 = (-a02 + a21 + a22) * (b11 + b20 - b21);
          const m13 = (a02 - a22) * (b11 - b21);
          const m14 = a02 * b20;
          const m15 = (a21 + a22) * (-b20 + b21);
          const m16 = (-a02 + a11 + a12) * (b12 + b20 - b22);
          const m17 = (a02 - a12) * (b12 - b22);
          const m18 = (a11 + a12) * (-b20 + b22);
          const m19 = a01 * b10;
          const m20 = a12 * b21;
          const m21 = a10 * b02;
          const m22 = a20 * b01;
          const m23 = a22 * b22;
          const c00 = m6 + m14 + m19;
          const c01 = m1 + m4 + m5 + m6 + m12 + m14 + m15;
          const c02 = m6 + m7 + m9 + m10 + m14 + m16 + m18;
          const c10 = m2 + m3 + m4 + m6 + m14 + m16 + m17;
          const c11 = m2 + m4 + m5 + m6 + m20;
          const c12 = m14 + m16 + m17 + m18 + m21;
          const c20 = m6 + m7 + m8 + m11 + m12 + m13 + m14;
          const c21 = m12 + m13 + m14 + m15 + m22;
          const c22 = m6 + m7 + m8 + m9 + m23;
          result.set(0, 0, c00);
          result.set(0, 1, c01);
          result.set(0, 2, c02);
          result.set(1, 0, c10);
          result.set(1, 1, c11);
          result.set(1, 2, c12);
          result.set(2, 0, c20);
          result.set(2, 1, c21);
          result.set(2, 2, c22);
          return result;
        }
        mmulStrassen(y) {
          y = Matrix3.checkMatrix(y);
          let x = this.clone();
          let r1 = x.rows;
          let c1 = x.columns;
          let r2 = y.rows;
          let c2 = y.columns;
          if (c1 !== r2) {
            console.warn(
              `Multiplying ${r1} x ${c1} and ${r2} x ${c2} matrix: dimensions do not match.`
            );
          }
          function embed(mat, rows, cols) {
            let r3 = mat.rows;
            let c3 = mat.columns;
            if (r3 === rows && c3 === cols) {
              return mat;
            } else {
              let resultat = _AbstractMatrix.zeros(rows, cols);
              resultat = resultat.setSubMatrix(mat, 0, 0);
              return resultat;
            }
          }
          let r = Math.max(r1, r2);
          let c = Math.max(c1, c2);
          x = embed(x, r, c);
          y = embed(y, r, c);
          function blockMult(a, b, rows, cols) {
            if (rows <= 512 || cols <= 512) {
              return a.mmul(b);
            }
            if (rows % 2 === 1 && cols % 2 === 1) {
              a = embed(a, rows + 1, cols + 1);
              b = embed(b, rows + 1, cols + 1);
            } else if (rows % 2 === 1) {
              a = embed(a, rows + 1, cols);
              b = embed(b, rows + 1, cols);
            } else if (cols % 2 === 1) {
              a = embed(a, rows, cols + 1);
              b = embed(b, rows, cols + 1);
            }
            let halfRows = parseInt(a.rows / 2, 10);
            let halfCols = parseInt(a.columns / 2, 10);
            let a11 = a.subMatrix(0, halfRows - 1, 0, halfCols - 1);
            let b11 = b.subMatrix(0, halfRows - 1, 0, halfCols - 1);
            let a12 = a.subMatrix(0, halfRows - 1, halfCols, a.columns - 1);
            let b12 = b.subMatrix(0, halfRows - 1, halfCols, b.columns - 1);
            let a21 = a.subMatrix(halfRows, a.rows - 1, 0, halfCols - 1);
            let b21 = b.subMatrix(halfRows, b.rows - 1, 0, halfCols - 1);
            let a22 = a.subMatrix(halfRows, a.rows - 1, halfCols, a.columns - 1);
            let b22 = b.subMatrix(halfRows, b.rows - 1, halfCols, b.columns - 1);
            let m1 = blockMult(
              _AbstractMatrix.add(a11, a22),
              _AbstractMatrix.add(b11, b22),
              halfRows,
              halfCols
            );
            let m2 = blockMult(_AbstractMatrix.add(a21, a22), b11, halfRows, halfCols);
            let m3 = blockMult(a11, _AbstractMatrix.sub(b12, b22), halfRows, halfCols);
            let m4 = blockMult(a22, _AbstractMatrix.sub(b21, b11), halfRows, halfCols);
            let m5 = blockMult(_AbstractMatrix.add(a11, a12), b22, halfRows, halfCols);
            let m6 = blockMult(
              _AbstractMatrix.sub(a21, a11),
              _AbstractMatrix.add(b11, b12),
              halfRows,
              halfCols
            );
            let m7 = blockMult(
              _AbstractMatrix.sub(a12, a22),
              _AbstractMatrix.add(b21, b22),
              halfRows,
              halfCols
            );
            let c11 = _AbstractMatrix.add(m1, m4);
            c11.sub(m5);
            c11.add(m7);
            let c12 = _AbstractMatrix.add(m3, m5);
            let c21 = _AbstractMatrix.add(m2, m4);
            let c22 = _AbstractMatrix.sub(m1, m2);
            c22.add(m3);
            c22.add(m6);
            let result = _AbstractMatrix.zeros(2 * c11.rows, 2 * c11.columns);
            result = result.setSubMatrix(c11, 0, 0);
            result = result.setSubMatrix(c12, c11.rows, 0);
            result = result.setSubMatrix(c21, 0, c11.columns);
            result = result.setSubMatrix(c22, c11.rows, c11.columns);
            return result.subMatrix(0, rows - 1, 0, cols - 1);
          }
          return blockMult(x, y, r, c);
        }
        scaleRows(options = {}) {
          if (typeof options !== "object") {
            throw new TypeError("options must be an object");
          }
          const { min: min2 = 0, max: max2 = 1 } = options;
          if (!Number.isFinite(min2)) throw new TypeError("min must be a number");
          if (!Number.isFinite(max2)) throw new TypeError("max must be a number");
          if (min2 >= max2) throw new RangeError("min must be smaller than max");
          let newMatrix = new Matrix3(this.rows, this.columns);
          for (let i = 0; i < this.rows; i++) {
            const row = this.getRow(i);
            if (row.length > 0) {
              rescale(row, { min: min2, max: max2, output: row });
            }
            newMatrix.setRow(i, row);
          }
          return newMatrix;
        }
        scaleColumns(options = {}) {
          if (typeof options !== "object") {
            throw new TypeError("options must be an object");
          }
          const { min: min2 = 0, max: max2 = 1 } = options;
          if (!Number.isFinite(min2)) throw new TypeError("min must be a number");
          if (!Number.isFinite(max2)) throw new TypeError("max must be a number");
          if (min2 >= max2) throw new RangeError("min must be smaller than max");
          let newMatrix = new Matrix3(this.rows, this.columns);
          for (let i = 0; i < this.columns; i++) {
            const column = this.getColumn(i);
            if (column.length) {
              rescale(column, {
                min: min2,
                max: max2,
                output: column
              });
            }
            newMatrix.setColumn(i, column);
          }
          return newMatrix;
        }
        flipRows() {
          const middle = Math.ceil(this.columns / 2);
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < middle; j++) {
              let first = this.get(i, j);
              let last = this.get(i, this.columns - 1 - j);
              this.set(i, j, last);
              this.set(i, this.columns - 1 - j, first);
            }
          }
          return this;
        }
        flipColumns() {
          const middle = Math.ceil(this.rows / 2);
          for (let j = 0; j < this.columns; j++) {
            for (let i = 0; i < middle; i++) {
              let first = this.get(i, j);
              let last = this.get(this.rows - 1 - i, j);
              this.set(i, j, last);
              this.set(this.rows - 1 - i, j, first);
            }
          }
          return this;
        }
        kroneckerProduct(other) {
          other = Matrix3.checkMatrix(other);
          let m = this.rows;
          let n = this.columns;
          let p = other.rows;
          let q = other.columns;
          let result = new Matrix3(m * p, n * q);
          for (let i = 0; i < m; i++) {
            for (let j = 0; j < n; j++) {
              for (let k = 0; k < p; k++) {
                for (let l = 0; l < q; l++) {
                  result.set(p * i + k, q * j + l, this.get(i, j) * other.get(k, l));
                }
              }
            }
          }
          return result;
        }
        kroneckerSum(other) {
          other = Matrix3.checkMatrix(other);
          if (!this.isSquare() || !other.isSquare()) {
            throw new Error("Kronecker Sum needs two Square Matrices");
          }
          let m = this.rows;
          let n = other.rows;
          let AxI = this.kroneckerProduct(Matrix3.eye(n, n));
          let IxB = Matrix3.eye(m, m).kroneckerProduct(other);
          return AxI.add(IxB);
        }
        transpose() {
          let result = new Matrix3(this.columns, this.rows);
          for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.columns; j++) {
              result.set(j, i, this.get(i, j));
            }
          }
          return result;
        }
        sortRows(compareFunction = compareNumbers) {
          for (let i = 0; i < this.rows; i++) {
            this.setRow(i, this.getRow(i).sort(compareFunction));
          }
          return this;
        }
        sortColumns(compareFunction = compareNumbers) {
          for (let i = 0; i < this.columns; i++) {
            this.setColumn(i, this.getColumn(i).sort(compareFunction));
          }
          return this;
        }
        subMatrix(startRow, endRow, startColumn, endColumn) {
          checkRange(this, startRow, endRow, startColumn, endColumn);
          let newMatrix = new Matrix3(
            endRow - startRow + 1,
            endColumn - startColumn + 1
          );
          for (let i = startRow; i <= endRow; i++) {
            for (let j = startColumn; j <= endColumn; j++) {
              newMatrix.set(i - startRow, j - startColumn, this.get(i, j));
            }
          }
          return newMatrix;
        }
        subMatrixRow(indices, startColumn, endColumn) {
          if (startColumn === void 0) startColumn = 0;
          if (endColumn === void 0) endColumn = this.columns - 1;
          if (startColumn > endColumn || startColumn < 0 || startColumn >= this.columns || endColumn < 0 || endColumn >= this.columns) {
            throw new RangeError("Argument out of range");
          }
          let newMatrix = new Matrix3(indices.length, endColumn - startColumn + 1);
          for (let i = 0; i < indices.length; i++) {
            for (let j = startColumn; j <= endColumn; j++) {
              if (indices[i] < 0 || indices[i] >= this.rows) {
                throw new RangeError(`Row index out of range: ${indices[i]}`);
              }
              newMatrix.set(i, j - startColumn, this.get(indices[i], j));
            }
          }
          return newMatrix;
        }
        subMatrixColumn(indices, startRow, endRow) {
          if (startRow === void 0) startRow = 0;
          if (endRow === void 0) endRow = this.rows - 1;
          if (startRow > endRow || startRow < 0 || startRow >= this.rows || endRow < 0 || endRow >= this.rows) {
            throw new RangeError("Argument out of range");
          }
          let newMatrix = new Matrix3(endRow - startRow + 1, indices.length);
          for (let i = 0; i < indices.length; i++) {
            for (let j = startRow; j <= endRow; j++) {
              if (indices[i] < 0 || indices[i] >= this.columns) {
                throw new RangeError(`Column index out of range: ${indices[i]}`);
              }
              newMatrix.set(j - startRow, i, this.get(j, indices[i]));
            }
          }
          return newMatrix;
        }
        setSubMatrix(matrix2, startRow, startColumn) {
          matrix2 = Matrix3.checkMatrix(matrix2);
          if (matrix2.isEmpty()) {
            return this;
          }
          let endRow = startRow + matrix2.rows - 1;
          let endColumn = startColumn + matrix2.columns - 1;
          checkRange(this, startRow, endRow, startColumn, endColumn);
          for (let i = 0; i < matrix2.rows; i++) {
            for (let j = 0; j < matrix2.columns; j++) {
              this.set(startRow + i, startColumn + j, matrix2.get(i, j));
            }
          }
          return this;
        }
        concat(other, by = "row") {
          other = Matrix3.checkMatrix(other);
          switch (by) {
            case "row": {
              if (this.columns !== other.columns) {
                throw new RangeError(
                  "both matrices must have the same number of columns"
                );
              }
              const result = new Matrix3(this.rows + other.rows, this.columns);
              result.setSubMatrix(this, 0, 0);
              result.setSubMatrix(other, this.rows, 0);
              return result;
            }
            case "column": {
              if (this.rows !== other.rows) {
                throw new RangeError(
                  "both matrices must have the same number of rows"
                );
              }
              const result = new Matrix3(this.rows, this.columns + other.columns);
              result.setSubMatrix(this, 0, 0);
              result.setSubMatrix(other, 0, this.columns);
              return result;
            }
            default:
              throw new Error(`invalid option: ${by}`);
          }
        }
        selection(rowIndices, columnIndices) {
          checkRowIndices(this, rowIndices);
          checkColumnIndices(this, columnIndices);
          let newMatrix = new Matrix3(rowIndices.length, columnIndices.length);
          for (let i = 0; i < rowIndices.length; i++) {
            let rowIndex = rowIndices[i];
            for (let j = 0; j < columnIndices.length; j++) {
              let columnIndex = columnIndices[j];
              newMatrix.set(i, j, this.get(rowIndex, columnIndex));
            }
          }
          return newMatrix;
        }
        trace() {
          let min2 = Math.min(this.rows, this.columns);
          let trace = 0;
          for (let i = 0; i < min2; i++) {
            trace += this.get(i, i);
          }
          return trace;
        }
        clone() {
          return this.constructor.copy(this, new Matrix3(this.rows, this.columns));
        }
        /**
         * @template {AbstractMatrix} M
         * @param {AbstractMatrix} from
         * @param {M} to
         * @return {M}
         */
        static copy(from, to) {
          for (const [row, column, value] of from.entries()) {
            to.set(row, column, value);
          }
          return to;
        }
        sum(by) {
          switch (by) {
            case "row":
              return sumByRow(this);
            case "column":
              return sumByColumn(this);
            case void 0:
              return sumAll(this);
            default:
              throw new Error(`invalid option: ${by}`);
          }
        }
        product(by) {
          switch (by) {
            case "row":
              return productByRow(this);
            case "column":
              return productByColumn(this);
            case void 0:
              return productAll(this);
            default:
              throw new Error(`invalid option: ${by}`);
          }
        }
        mean(by) {
          const sum2 = this.sum(by);
          switch (by) {
            case "row": {
              for (let i = 0; i < this.rows; i++) {
                sum2[i] /= this.columns;
              }
              return sum2;
            }
            case "column": {
              for (let i = 0; i < this.columns; i++) {
                sum2[i] /= this.rows;
              }
              return sum2;
            }
            case void 0:
              return sum2 / this.size;
            default:
              throw new Error(`invalid option: ${by}`);
          }
        }
        variance(by, options = {}) {
          if (typeof by === "object") {
            options = by;
            by = void 0;
          }
          if (typeof options !== "object") {
            throw new TypeError("options must be an object");
          }
          const { unbiased = true, mean = this.mean(by) } = options;
          if (typeof unbiased !== "boolean") {
            throw new TypeError("unbiased must be a boolean");
          }
          switch (by) {
            case "row": {
              if (!isAnyArray(mean)) {
                throw new TypeError("mean must be an array");
              }
              return varianceByRow(this, unbiased, mean);
            }
            case "column": {
              if (!isAnyArray(mean)) {
                throw new TypeError("mean must be an array");
              }
              return varianceByColumn(this, unbiased, mean);
            }
            case void 0: {
              if (typeof mean !== "number") {
                throw new TypeError("mean must be a number");
              }
              return varianceAll(this, unbiased, mean);
            }
            default:
              throw new Error(`invalid option: ${by}`);
          }
        }
        standardDeviation(by, options) {
          if (typeof by === "object") {
            options = by;
            by = void 0;
          }
          const variance = this.variance(by, options);
          if (by === void 0) {
            return Math.sqrt(variance);
          } else {
            for (let i = 0; i < variance.length; i++) {
              variance[i] = Math.sqrt(variance[i]);
            }
            return variance;
          }
        }
        center(by, options = {}) {
          if (typeof by === "object") {
            options = by;
            by = void 0;
          }
          if (typeof options !== "object") {
            throw new TypeError("options must be an object");
          }
          const { center = this.mean(by) } = options;
          switch (by) {
            case "row": {
              if (!isAnyArray(center)) {
                throw new TypeError("center must be an array");
              }
              centerByRow(this, center);
              return this;
            }
            case "column": {
              if (!isAnyArray(center)) {
                throw new TypeError("center must be an array");
              }
              centerByColumn(this, center);
              return this;
            }
            case void 0: {
              if (typeof center !== "number") {
                throw new TypeError("center must be a number");
              }
              centerAll(this, center);
              return this;
            }
            default:
              throw new Error(`invalid option: ${by}`);
          }
        }
        scale(by, options = {}) {
          if (typeof by === "object") {
            options = by;
            by = void 0;
          }
          if (typeof options !== "object") {
            throw new TypeError("options must be an object");
          }
          let scale = options.scale;
          switch (by) {
            case "row": {
              if (scale === void 0) {
                scale = getScaleByRow(this);
              } else if (!isAnyArray(scale)) {
                throw new TypeError("scale must be an array");
              }
              scaleByRow(this, scale);
              return this;
            }
            case "column": {
              if (scale === void 0) {
                scale = getScaleByColumn(this);
              } else if (!isAnyArray(scale)) {
                throw new TypeError("scale must be an array");
              }
              scaleByColumn(this, scale);
              return this;
            }
            case void 0: {
              if (scale === void 0) {
                scale = getScaleAll(this);
              } else if (typeof scale !== "number") {
                throw new TypeError("scale must be a number");
              }
              scaleAll(this, scale);
              return this;
            }
            default:
              throw new Error(`invalid option: ${by}`);
          }
        }
        toString(options) {
          return inspectMatrixWithOptions(this, options);
        }
        [Symbol.iterator]() {
          return this.entries();
        }
        /**
         * iterator from left to right, from top to bottom
         * yield [row, column, value]
         * @returns {Generator<[number, number, number], void, void>}
         */
        *entries() {
          for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.columns; col++) {
              yield [row, col, this.get(row, col)];
            }
          }
        }
        /**
         * iterator from left to right, from top to bottom
         * yield value
         * @returns {Generator<number, void, void>}
         */
        *values() {
          for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.columns; col++) {
              yield this.get(row, col);
            }
          }
        }
      };
      AbstractMatrix2.prototype.klass = "Matrix";
      if (typeof Symbol !== "undefined") {
        AbstractMatrix2.prototype[Symbol.for("nodejs.util.inspect.custom")] = inspectMatrix;
      }
      function compareNumbers(a, b) {
        return a - b;
      }
      function isArrayOfNumbers(array) {
        return array.every((element) => {
          return typeof element === "number";
        });
      }
      AbstractMatrix2.random = AbstractMatrix2.rand;
      AbstractMatrix2.randomInt = AbstractMatrix2.randInt;
      AbstractMatrix2.diagonal = AbstractMatrix2.diag;
      AbstractMatrix2.prototype.diagonal = AbstractMatrix2.prototype.diag;
      AbstractMatrix2.identity = AbstractMatrix2.eye;
      AbstractMatrix2.prototype.negate = AbstractMatrix2.prototype.neg;
      AbstractMatrix2.prototype.tensorProduct = AbstractMatrix2.prototype.kroneckerProduct;
      var _Matrix_instances, initData_fn;
      var _Matrix = class _Matrix extends AbstractMatrix2 {
        constructor(nRows, nColumns) {
          super();
          __privateAdd(this, _Matrix_instances);
          /**
           * @type {Float64Array[]}
           */
          __publicField(this, "data");
          if (_Matrix.isMatrix(nRows)) {
            __privateMethod(this, _Matrix_instances, initData_fn).call(this, nRows.rows, nRows.columns);
            _Matrix.copy(nRows, this);
          } else if (Number.isInteger(nRows) && nRows >= 0) {
            __privateMethod(this, _Matrix_instances, initData_fn).call(this, nRows, nColumns);
          } else if (isAnyArray(nRows)) {
            const arrayData = nRows;
            nRows = arrayData.length;
            nColumns = nRows ? arrayData[0].length : 0;
            if (typeof nColumns !== "number") {
              throw new TypeError(
                "Data must be a 2D array with at least one element"
              );
            }
            this.data = [];
            for (let i = 0; i < nRows; i++) {
              if (arrayData[i].length !== nColumns) {
                throw new RangeError("Inconsistent array dimensions");
              }
              if (!isArrayOfNumbers(arrayData[i])) {
                throw new TypeError("Input data contains non-numeric values");
              }
              this.data.push(Float64Array.from(arrayData[i]));
            }
            this.rows = nRows;
            this.columns = nColumns;
          } else {
            throw new TypeError(
              "First argument must be a positive number or an array"
            );
          }
        }
        set(rowIndex, columnIndex, value) {
          this.data[rowIndex][columnIndex] = value;
          return this;
        }
        get(rowIndex, columnIndex) {
          return this.data[rowIndex][columnIndex];
        }
        removeRow(index) {
          checkRowIndex(this, index);
          this.data.splice(index, 1);
          this.rows -= 1;
          return this;
        }
        addRow(index, array) {
          if (array === void 0) {
            array = index;
            index = this.rows;
          }
          checkRowIndex(this, index, true);
          array = Float64Array.from(checkRowVector(this, array));
          this.data.splice(index, 0, array);
          this.rows += 1;
          return this;
        }
        removeColumn(index) {
          checkColumnIndex(this, index);
          for (let i = 0; i < this.rows; i++) {
            const newRow = new Float64Array(this.columns - 1);
            for (let j = 0; j < index; j++) {
              newRow[j] = this.data[i][j];
            }
            for (let j = index + 1; j < this.columns; j++) {
              newRow[j - 1] = this.data[i][j];
            }
            this.data[i] = newRow;
          }
          this.columns -= 1;
          return this;
        }
        addColumn(index, array) {
          if (typeof array === "undefined") {
            array = index;
            index = this.columns;
          }
          checkColumnIndex(this, index, true);
          array = checkColumnVector(this, array);
          for (let i = 0; i < this.rows; i++) {
            const newRow = new Float64Array(this.columns + 1);
            let j = 0;
            for (; j < index; j++) {
              newRow[j] = this.data[i][j];
            }
            newRow[j++] = array[i];
            for (; j < this.columns + 1; j++) {
              newRow[j] = this.data[i][j - 1];
            }
            this.data[i] = newRow;
          }
          this.columns += 1;
          return this;
        }
      };
      _Matrix_instances = new WeakSet();
      /**
       * Init an empty matrix
       * @param {number} nRows
       * @param {number} nColumns
       */
      initData_fn = function(nRows, nColumns) {
        this.data = [];
        if (Number.isInteger(nColumns) && nColumns >= 0) {
          for (let i = 0; i < nRows; i++) {
            this.data.push(new Float64Array(nColumns));
          }
        } else {
          throw new TypeError("nColumns must be a positive integer");
        }
        this.rows = nRows;
        this.columns = nColumns;
      };
      var Matrix3 = _Matrix;
      installMathOperations(AbstractMatrix2, Matrix3);
      var _matrix;
      var _SymmetricMatrix = class _SymmetricMatrix extends AbstractMatrix2 {
        /**
         * @param {number | AbstractMatrix | ArrayLike<ArrayLike<number>>} diagonalSize
         * @return {this}
         */
        constructor(diagonalSize) {
          super();
          /** @type {Matrix} */
          __privateAdd(this, _matrix);
          if (Matrix3.isMatrix(diagonalSize)) {
            if (!diagonalSize.isSymmetric()) {
              throw new TypeError("not symmetric data");
            }
            __privateSet(this, _matrix, Matrix3.copy(
              diagonalSize,
              new Matrix3(diagonalSize.rows, diagonalSize.rows)
            ));
          } else if (Number.isInteger(diagonalSize) && diagonalSize >= 0) {
            __privateSet(this, _matrix, new Matrix3(diagonalSize, diagonalSize));
          } else {
            __privateSet(this, _matrix, new Matrix3(diagonalSize));
            if (!this.isSymmetric()) {
              throw new TypeError("not symmetric data");
            }
          }
        }
        get size() {
          return __privateGet(this, _matrix).size;
        }
        get rows() {
          return __privateGet(this, _matrix).rows;
        }
        get columns() {
          return __privateGet(this, _matrix).columns;
        }
        get diagonalSize() {
          return this.rows;
        }
        /**
         * not the same as matrix.isSymmetric()
         * Here is to check if it's instanceof SymmetricMatrix without bundling issues
         *
         * @param value
         * @returns {boolean}
         */
        static isSymmetricMatrix(value) {
          return Matrix3.isMatrix(value) && value.klassType === "SymmetricMatrix";
        }
        /**
         * @param diagonalSize
         * @return {SymmetricMatrix}
         */
        static zeros(diagonalSize) {
          return new this(diagonalSize);
        }
        /**
         * @param diagonalSize
         * @return {SymmetricMatrix}
         */
        static ones(diagonalSize) {
          return new this(diagonalSize).fill(1);
        }
        clone() {
          const matrix2 = new _SymmetricMatrix(this.diagonalSize);
          for (const [row, col, value] of this.upperRightEntries()) {
            matrix2.set(row, col, value);
          }
          return matrix2;
        }
        toMatrix() {
          return new Matrix3(this);
        }
        get(rowIndex, columnIndex) {
          return __privateGet(this, _matrix).get(rowIndex, columnIndex);
        }
        set(rowIndex, columnIndex, value) {
          __privateGet(this, _matrix).set(rowIndex, columnIndex, value);
          __privateGet(this, _matrix).set(columnIndex, rowIndex, value);
          return this;
        }
        removeCross(index) {
          __privateGet(this, _matrix).removeRow(index);
          __privateGet(this, _matrix).removeColumn(index);
          return this;
        }
        addCross(index, array) {
          if (array === void 0) {
            array = index;
            index = this.diagonalSize;
          }
          const row = array.slice();
          row.splice(index, 1);
          __privateGet(this, _matrix).addRow(index, row);
          __privateGet(this, _matrix).addColumn(index, array);
          return this;
        }
        /**
         * @param {Mask[]} mask
         */
        applyMask(mask) {
          if (mask.length !== this.diagonalSize) {
            throw new RangeError("Mask size do not match with matrix size");
          }
          const sidesToRemove = [];
          for (const [index, passthroughs] of mask.entries()) {
            if (passthroughs) continue;
            sidesToRemove.push(index);
          }
          sidesToRemove.reverse();
          for (const sideIndex of sidesToRemove) {
            this.removeCross(sideIndex);
          }
          return this;
        }
        /**
         * Compact format upper-right corner of matrix
         * iterate from left to right, from top to bottom.
         *
         * ```
         *   A B C D
         * A 1 2 3 4
         * B 2 5 6 7
         * C 3 6 8 9
         * D 4 7 9 10
         * ```
         *
         * will return compact 1D array `[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]`
         *
         * length is S(i=0, n=sideSize) => 10 for a 4 sideSized matrix
         *
         * @returns {number[]}
         */
        toCompact() {
          const { diagonalSize } = this;
          const compact = new Array(diagonalSize * (diagonalSize + 1) / 2);
          for (let col = 0, row = 0, index = 0; index < compact.length; index++) {
            compact[index] = this.get(row, col);
            if (++col >= diagonalSize) col = ++row;
          }
          return compact;
        }
        /**
         * @param {number[]} compact
         * @return {SymmetricMatrix}
         */
        static fromCompact(compact) {
          const compactSize = compact.length;
          const diagonalSize = (Math.sqrt(8 * compactSize + 1) - 1) / 2;
          if (!Number.isInteger(diagonalSize)) {
            throw new TypeError(
              `This array is not a compact representation of a Symmetric Matrix, ${JSON.stringify(
                compact
              )}`
            );
          }
          const matrix2 = new _SymmetricMatrix(diagonalSize);
          for (let col = 0, row = 0, index = 0; index < compactSize; index++) {
            matrix2.set(col, row, compact[index]);
            if (++col >= diagonalSize) col = ++row;
          }
          return matrix2;
        }
        /**
         * half iterator upper-right-corner from left to right, from top to bottom
         * yield [row, column, value]
         *
         * @returns {Generator<[number, number, number], void, void>}
         */
        *upperRightEntries() {
          for (let row = 0, col = 0; row < this.diagonalSize; void 0) {
            const value = this.get(row, col);
            yield [row, col, value];
            if (++col >= this.diagonalSize) col = ++row;
          }
        }
        /**
         * half iterator upper-right-corner from left to right, from top to bottom
         * yield value
         *
         * @returns {Generator<[number, number, number], void, void>}
         */
        *upperRightValues() {
          for (let row = 0, col = 0; row < this.diagonalSize; void 0) {
            const value = this.get(row, col);
            yield value;
            if (++col >= this.diagonalSize) col = ++row;
          }
        }
      };
      _matrix = new WeakMap();
      var SymmetricMatrix2 = _SymmetricMatrix;
      SymmetricMatrix2.prototype.klassType = "SymmetricMatrix";
      var DistanceMatrix2 = class _DistanceMatrix extends SymmetricMatrix2 {
        /**
         * not the same as matrix.isSymmetric()
         * Here is to check if it's instanceof SymmetricMatrix without bundling issues
         *
         * @param value
         * @returns {boolean}
         */
        static isDistanceMatrix(value) {
          return SymmetricMatrix2.isSymmetricMatrix(value) && value.klassSubType === "DistanceMatrix";
        }
        constructor(sideSize) {
          super(sideSize);
          if (!this.isDistance()) {
            throw new TypeError("Provided arguments do no produce a distance matrix");
          }
        }
        set(rowIndex, columnIndex, value) {
          if (rowIndex === columnIndex) value = 0;
          return super.set(rowIndex, columnIndex, value);
        }
        addCross(index, array) {
          if (array === void 0) {
            array = index;
            index = this.diagonalSize;
          }
          array = array.slice();
          array[index] = 0;
          return super.addCross(index, array);
        }
        toSymmetricMatrix() {
          return new SymmetricMatrix2(this);
        }
        clone() {
          const matrix2 = new _DistanceMatrix(this.diagonalSize);
          for (const [row, col, value] of this.upperRightEntries()) {
            if (row === col) continue;
            matrix2.set(row, col, value);
          }
          return matrix2;
        }
        /**
         * Compact format upper-right corner of matrix
         * no diagonal (only zeros)
         * iterable from left to right, from top to bottom.
         *
         * ```
         *   A B C D
         * A 0 1 2 3
         * B 1 0 4 5
         * C 2 4 0 6
         * D 3 5 6 0
         * ```
         *
         * will return compact 1D array `[1, 2, 3, 4, 5, 6]`
         *
         * length is S(i=0, n=sideSize-1) => 6 for a 4 side sized matrix
         *
         * @returns {number[]}
         */
        toCompact() {
          const { diagonalSize } = this;
          const compactLength = (diagonalSize - 1) * diagonalSize / 2;
          const compact = new Array(compactLength);
          for (let col = 1, row = 0, index = 0; index < compact.length; index++) {
            compact[index] = this.get(row, col);
            if (++col >= diagonalSize) col = ++row + 1;
          }
          return compact;
        }
        /**
         * @param {number[]} compact
         */
        static fromCompact(compact) {
          const compactSize = compact.length;
          if (compactSize === 0) {
            return new this(0);
          }
          const diagonalSize = (Math.sqrt(8 * compactSize + 1) + 1) / 2;
          if (!Number.isInteger(diagonalSize)) {
            throw new TypeError(
              `This array is not a compact representation of a DistanceMatrix, ${JSON.stringify(
                compact
              )}`
            );
          }
          const matrix2 = new this(diagonalSize);
          for (let col = 1, row = 0, index = 0; index < compactSize; index++) {
            matrix2.set(col, row, compact[index]);
            if (++col >= diagonalSize) col = ++row + 1;
          }
          return matrix2;
        }
      };
      DistanceMatrix2.prototype.klassSubType = "DistanceMatrix";
      var BaseView = class extends AbstractMatrix2 {
        constructor(matrix2, rows, columns) {
          super();
          this.matrix = matrix2;
          this.rows = rows;
          this.columns = columns;
        }
      };
      var MatrixColumnView2 = class extends BaseView {
        constructor(matrix2, column) {
          checkColumnIndex(matrix2, column);
          super(matrix2, matrix2.rows, 1);
          this.column = column;
        }
        set(rowIndex, columnIndex, value) {
          this.matrix.set(rowIndex, this.column, value);
          return this;
        }
        get(rowIndex) {
          return this.matrix.get(rowIndex, this.column);
        }
      };
      var MatrixColumnSelectionView2 = class extends BaseView {
        constructor(matrix2, columnIndices) {
          checkColumnIndices(matrix2, columnIndices);
          super(matrix2, matrix2.rows, columnIndices.length);
          this.columnIndices = columnIndices;
        }
        set(rowIndex, columnIndex, value) {
          this.matrix.set(rowIndex, this.columnIndices[columnIndex], value);
          return this;
        }
        get(rowIndex, columnIndex) {
          return this.matrix.get(rowIndex, this.columnIndices[columnIndex]);
        }
      };
      var MatrixFlipColumnView2 = class extends BaseView {
        constructor(matrix2) {
          super(matrix2, matrix2.rows, matrix2.columns);
        }
        set(rowIndex, columnIndex, value) {
          this.matrix.set(rowIndex, this.columns - columnIndex - 1, value);
          return this;
        }
        get(rowIndex, columnIndex) {
          return this.matrix.get(rowIndex, this.columns - columnIndex - 1);
        }
      };
      var MatrixFlipRowView2 = class extends BaseView {
        constructor(matrix2) {
          super(matrix2, matrix2.rows, matrix2.columns);
        }
        set(rowIndex, columnIndex, value) {
          this.matrix.set(this.rows - rowIndex - 1, columnIndex, value);
          return this;
        }
        get(rowIndex, columnIndex) {
          return this.matrix.get(this.rows - rowIndex - 1, columnIndex);
        }
      };
      var MatrixRowView2 = class extends BaseView {
        constructor(matrix2, row) {
          checkRowIndex(matrix2, row);
          super(matrix2, 1, matrix2.columns);
          this.row = row;
        }
        set(rowIndex, columnIndex, value) {
          this.matrix.set(this.row, columnIndex, value);
          return this;
        }
        get(rowIndex, columnIndex) {
          return this.matrix.get(this.row, columnIndex);
        }
      };
      var MatrixRowSelectionView2 = class extends BaseView {
        constructor(matrix2, rowIndices) {
          checkRowIndices(matrix2, rowIndices);
          super(matrix2, rowIndices.length, matrix2.columns);
          this.rowIndices = rowIndices;
        }
        set(rowIndex, columnIndex, value) {
          this.matrix.set(this.rowIndices[rowIndex], columnIndex, value);
          return this;
        }
        get(rowIndex, columnIndex) {
          return this.matrix.get(this.rowIndices[rowIndex], columnIndex);
        }
      };
      var MatrixSelectionView2 = class extends BaseView {
        constructor(matrix2, rowIndices, columnIndices) {
          checkRowIndices(matrix2, rowIndices);
          checkColumnIndices(matrix2, columnIndices);
          super(matrix2, rowIndices.length, columnIndices.length);
          this.rowIndices = rowIndices;
          this.columnIndices = columnIndices;
        }
        set(rowIndex, columnIndex, value) {
          this.matrix.set(
            this.rowIndices[rowIndex],
            this.columnIndices[columnIndex],
            value
          );
          return this;
        }
        get(rowIndex, columnIndex) {
          return this.matrix.get(
            this.rowIndices[rowIndex],
            this.columnIndices[columnIndex]
          );
        }
      };
      var MatrixSubView2 = class extends BaseView {
        constructor(matrix2, startRow, endRow, startColumn, endColumn) {
          checkRange(matrix2, startRow, endRow, startColumn, endColumn);
          super(matrix2, endRow - startRow + 1, endColumn - startColumn + 1);
          this.startRow = startRow;
          this.startColumn = startColumn;
        }
        set(rowIndex, columnIndex, value) {
          this.matrix.set(
            this.startRow + rowIndex,
            this.startColumn + columnIndex,
            value
          );
          return this;
        }
        get(rowIndex, columnIndex) {
          return this.matrix.get(
            this.startRow + rowIndex,
            this.startColumn + columnIndex
          );
        }
      };
      var MatrixTransposeView2 = class extends BaseView {
        constructor(matrix2) {
          super(matrix2, matrix2.columns, matrix2.rows);
        }
        set(rowIndex, columnIndex, value) {
          this.matrix.set(columnIndex, rowIndex, value);
          return this;
        }
        get(rowIndex, columnIndex) {
          return this.matrix.get(columnIndex, rowIndex);
        }
      };
      var WrapperMatrix1D2 = class extends AbstractMatrix2 {
        constructor(data, options = {}) {
          const { rows = 1 } = options;
          if (data.length % rows !== 0) {
            throw new Error("the data length is not divisible by the number of rows");
          }
          super();
          this.rows = rows;
          this.columns = data.length / rows;
          this.data = data;
        }
        set(rowIndex, columnIndex, value) {
          let index = this._calculateIndex(rowIndex, columnIndex);
          this.data[index] = value;
          return this;
        }
        get(rowIndex, columnIndex) {
          let index = this._calculateIndex(rowIndex, columnIndex);
          return this.data[index];
        }
        _calculateIndex(row, column) {
          return row * this.columns + column;
        }
      };
      var WrapperMatrix2D2 = class extends AbstractMatrix2 {
        constructor(data) {
          super();
          this.data = data;
          this.rows = data.length;
          this.columns = data[0].length;
        }
        set(rowIndex, columnIndex, value) {
          this.data[rowIndex][columnIndex] = value;
          return this;
        }
        get(rowIndex, columnIndex) {
          return this.data[rowIndex][columnIndex];
        }
      };
      function wrap2(array, options) {
        if (isAnyArray(array)) {
          if (array[0] && isAnyArray(array[0])) {
            return new WrapperMatrix2D2(array);
          } else {
            return new WrapperMatrix1D2(array, options);
          }
        } else {
          throw new Error("the argument is not an array");
        }
      }
      var LuDecomposition2 = class {
        constructor(matrix2) {
          matrix2 = WrapperMatrix2D2.checkMatrix(matrix2);
          let lu = matrix2.clone();
          let rows = lu.rows;
          let columns = lu.columns;
          let pivotVector = new Float64Array(rows);
          let pivotSign = 1;
          let i, j, k, p, s, t, v;
          let LUcolj, kmax;
          for (i = 0; i < rows; i++) {
            pivotVector[i] = i;
          }
          LUcolj = new Float64Array(rows);
          for (j = 0; j < columns; j++) {
            for (i = 0; i < rows; i++) {
              LUcolj[i] = lu.get(i, j);
            }
            for (i = 0; i < rows; i++) {
              kmax = Math.min(i, j);
              s = 0;
              for (k = 0; k < kmax; k++) {
                s += lu.get(i, k) * LUcolj[k];
              }
              LUcolj[i] -= s;
              lu.set(i, j, LUcolj[i]);
            }
            p = j;
            for (i = j + 1; i < rows; i++) {
              if (Math.abs(LUcolj[i]) > Math.abs(LUcolj[p])) {
                p = i;
              }
            }
            if (p !== j) {
              for (k = 0; k < columns; k++) {
                t = lu.get(p, k);
                lu.set(p, k, lu.get(j, k));
                lu.set(j, k, t);
              }
              v = pivotVector[p];
              pivotVector[p] = pivotVector[j];
              pivotVector[j] = v;
              pivotSign = -pivotSign;
            }
            if (j < rows && lu.get(j, j) !== 0) {
              for (i = j + 1; i < rows; i++) {
                lu.set(i, j, lu.get(i, j) / lu.get(j, j));
              }
            }
          }
          this.LU = lu;
          this.pivotVector = pivotVector;
          this.pivotSign = pivotSign;
        }
        isSingular() {
          let data = this.LU;
          let col = data.columns;
          for (let j = 0; j < col; j++) {
            if (data.get(j, j) === 0) {
              return true;
            }
          }
          return false;
        }
        solve(value) {
          value = Matrix3.checkMatrix(value);
          let lu = this.LU;
          let rows = lu.rows;
          if (rows !== value.rows) {
            throw new Error("Invalid matrix dimensions");
          }
          if (this.isSingular()) {
            throw new Error("LU matrix is singular");
          }
          let count = value.columns;
          let X = value.subMatrixRow(this.pivotVector, 0, count - 1);
          let columns = lu.columns;
          let i, j, k;
          for (k = 0; k < columns; k++) {
            for (i = k + 1; i < columns; i++) {
              for (j = 0; j < count; j++) {
                X.set(i, j, X.get(i, j) - X.get(k, j) * lu.get(i, k));
              }
            }
          }
          for (k = columns - 1; k >= 0; k--) {
            for (j = 0; j < count; j++) {
              X.set(k, j, X.get(k, j) / lu.get(k, k));
            }
            for (i = 0; i < k; i++) {
              for (j = 0; j < count; j++) {
                X.set(i, j, X.get(i, j) - X.get(k, j) * lu.get(i, k));
              }
            }
          }
          return X;
        }
        get determinant() {
          let data = this.LU;
          if (!data.isSquare()) {
            throw new Error("Matrix must be square");
          }
          let determinant3 = this.pivotSign;
          let col = data.columns;
          for (let j = 0; j < col; j++) {
            determinant3 *= data.get(j, j);
          }
          return determinant3;
        }
        get lowerTriangularMatrix() {
          let data = this.LU;
          let rows = data.rows;
          let columns = data.columns;
          let X = new Matrix3(rows, columns);
          for (let i = 0; i < rows; i++) {
            for (let j = 0; j < columns; j++) {
              if (i > j) {
                X.set(i, j, data.get(i, j));
              } else if (i === j) {
                X.set(i, j, 1);
              } else {
                X.set(i, j, 0);
              }
            }
          }
          return X;
        }
        get upperTriangularMatrix() {
          let data = this.LU;
          let rows = data.rows;
          let columns = data.columns;
          let X = new Matrix3(rows, columns);
          for (let i = 0; i < rows; i++) {
            for (let j = 0; j < columns; j++) {
              if (i <= j) {
                X.set(i, j, data.get(i, j));
              } else {
                X.set(i, j, 0);
              }
            }
          }
          return X;
        }
        get pivotPermutationVector() {
          return Array.from(this.pivotVector);
        }
      };
      function transposeSquareInPlace(matrix2) {
        const data = matrix2.data;
        const n = matrix2.rows;
        for (let i = 0; i < n; i++) {
          const rowI = data[i];
          for (let j = i + 1; j < n; j++) {
            const tmp = rowI[j];
            rowI[j] = data[j][i];
            data[j][i] = tmp;
          }
        }
        return matrix2;
      }
      function hypotenuse(a, b) {
        let r = 0;
        if (Math.abs(a) > Math.abs(b)) {
          r = b / a;
          return Math.abs(a) * Math.sqrt(1 + r * r);
        }
        if (b !== 0) {
          r = a / b;
          return Math.abs(b) * Math.sqrt(1 + r * r);
        }
        return 0;
      }
      var QrDecomposition2 = class {
        constructor(value) {
          value = WrapperMatrix2D2.checkMatrix(value);
          let qr = value.clone();
          let m = value.rows;
          let n = value.columns;
          let rdiag = new Float64Array(n);
          let i, j, k, s;
          for (k = 0; k < n; k++) {
            let nrm = 0;
            for (i = k; i < m; i++) {
              nrm = hypotenuse(nrm, qr.get(i, k));
            }
            if (nrm !== 0) {
              if (qr.get(k, k) < 0) {
                nrm = -nrm;
              }
              for (i = k; i < m; i++) {
                qr.set(i, k, qr.get(i, k) / nrm);
              }
              qr.set(k, k, qr.get(k, k) + 1);
              for (j = k + 1; j < n; j++) {
                s = 0;
                for (i = k; i < m; i++) {
                  s += qr.get(i, k) * qr.get(i, j);
                }
                s = -s / qr.get(k, k);
                for (i = k; i < m; i++) {
                  qr.set(i, j, qr.get(i, j) + s * qr.get(i, k));
                }
              }
            }
            rdiag[k] = -nrm;
          }
          this.QR = qr;
          this.Rdiag = rdiag;
        }
        solve(value) {
          value = Matrix3.checkMatrix(value);
          let qr = this.QR;
          let m = qr.rows;
          if (value.rows !== m) {
            throw new Error("Matrix row dimensions must agree");
          }
          if (!this.isFullRank()) {
            throw new Error("Matrix is rank deficient");
          }
          let count = value.columns;
          let X = value.clone();
          let n = qr.columns;
          let i, j, k, s;
          for (k = 0; k < n; k++) {
            for (j = 0; j < count; j++) {
              s = 0;
              for (i = k; i < m; i++) {
                s += qr.get(i, k) * X.get(i, j);
              }
              s = -s / qr.get(k, k);
              for (i = k; i < m; i++) {
                X.set(i, j, X.get(i, j) + s * qr.get(i, k));
              }
            }
          }
          for (k = n - 1; k >= 0; k--) {
            for (j = 0; j < count; j++) {
              X.set(k, j, X.get(k, j) / this.Rdiag[k]);
            }
            for (i = 0; i < k; i++) {
              for (j = 0; j < count; j++) {
                X.set(i, j, X.get(i, j) - X.get(k, j) * qr.get(i, k));
              }
            }
          }
          return X.subMatrix(0, n - 1, 0, count - 1);
        }
        isFullRank() {
          let columns = this.QR.columns;
          for (let i = 0; i < columns; i++) {
            if (this.Rdiag[i] === 0) {
              return false;
            }
          }
          return true;
        }
        get upperTriangularMatrix() {
          let qr = this.QR;
          let n = qr.columns;
          let X = new Matrix3(n, n);
          let i, j;
          for (i = 0; i < n; i++) {
            for (j = 0; j < n; j++) {
              if (i < j) {
                X.set(i, j, qr.get(i, j));
              } else if (i === j) {
                X.set(i, j, this.Rdiag[i]);
              } else {
                X.set(i, j, 0);
              }
            }
          }
          return X;
        }
        get orthogonalMatrix() {
          let qr = this.QR;
          let rows = qr.rows;
          let columns = qr.columns;
          let X = new Matrix3(rows, columns);
          let i, j, k, s;
          for (k = columns - 1; k >= 0; k--) {
            for (i = 0; i < rows; i++) {
              X.set(i, k, 0);
            }
            X.set(k, k, 1);
            for (j = k; j < columns; j++) {
              if (qr.get(k, k) !== 0) {
                s = 0;
                for (i = k; i < rows; i++) {
                  s += qr.get(i, k) * X.get(i, j);
                }
                s = -s / qr.get(k, k);
                for (i = k; i < rows; i++) {
                  X.set(i, j, X.get(i, j) + s * qr.get(i, k));
                }
              }
            }
          }
          return X;
        }
      };
      var SingularValueDecomposition2 = class {
        constructor(value, options = {}) {
          value = WrapperMatrix2D2.checkMatrix(value);
          if (value.isEmpty()) {
            throw new Error("Matrix must be non-empty");
          }
          let m = value.rows;
          let n = value.columns;
          const {
            computeLeftSingularVectors = true,
            computeRightSingularVectors = true,
            autoTranspose = false
          } = options;
          let wantu = Boolean(computeLeftSingularVectors);
          let wantv = Boolean(computeRightSingularVectors);
          let swapped = false;
          let at;
          if (m < n) {
            if (!autoTranspose) {
              console.warn(
                "Computing SVD on a matrix with more columns than rows. Consider enabling autoTranspose"
              );
              at = value.transpose();
            } else {
              at = value.clone();
              m = value.columns;
              n = value.rows;
              swapped = true;
              let aux = wantu;
              wantu = wantv;
              wantv = aux;
            }
          } else {
            at = value.transpose();
          }
          let nu = Math.min(m, n);
          let ni = Math.min(m + 1, n);
          let s = new Float64Array(ni);
          let U = new Matrix3(nu, m);
          let V2 = new Matrix3(n, n);
          let e = new Float64Array(n);
          let work = new Float64Array(m);
          let si = new Float64Array(ni);
          for (let i = 0; i < ni; i++) si[i] = i;
          let nct = Math.min(m - 1, n);
          let nrt = Math.max(0, Math.min(n - 2, m));
          let mrc = Math.max(nct, nrt);
          for (let k = 0; k < mrc; k++) {
            if (k < nct) {
              s[k] = 0;
              for (let i = k; i < m; i++) {
                s[k] = hypotenuse(s[k], at.get(k, i));
              }
              if (s[k] !== 0) {
                if (at.get(k, k) < 0) {
                  s[k] = -s[k];
                }
                for (let i = k; i < m; i++) {
                  at.set(k, i, at.get(k, i) / s[k]);
                }
                at.set(k, k, at.get(k, k) + 1);
              }
              s[k] = -s[k];
            }
            for (let j = k + 1; j < n; j++) {
              if (k < nct && s[k] !== 0) {
                let t = 0;
                for (let i = k; i < m; i++) {
                  t += at.get(k, i) * at.get(j, i);
                }
                t = -t / at.get(k, k);
                for (let i = k; i < m; i++) {
                  at.set(j, i, at.get(j, i) + t * at.get(k, i));
                }
              }
              e[j] = at.get(j, k);
            }
            if (wantu && k < nct) {
              for (let i = k; i < m; i++) {
                U.set(k, i, at.get(k, i));
              }
            }
            if (k < nrt) {
              e[k] = 0;
              for (let i = k + 1; i < n; i++) {
                e[k] = hypotenuse(e[k], e[i]);
              }
              if (e[k] !== 0) {
                if (e[k + 1] < 0) {
                  e[k] = 0 - e[k];
                }
                for (let i = k + 1; i < n; i++) {
                  e[i] /= e[k];
                }
                e[k + 1] += 1;
              }
              e[k] = -e[k];
              if (k + 1 < m && e[k] !== 0) {
                for (let i = k + 1; i < m; i++) {
                  work[i] = 0;
                }
                for (let i = k + 1; i < m; i++) {
                  for (let j = k + 1; j < n; j++) {
                    work[i] += e[j] * at.get(j, i);
                  }
                }
                for (let j = k + 1; j < n; j++) {
                  let t = -e[j] / e[k + 1];
                  for (let i = k + 1; i < m; i++) {
                    at.set(j, i, at.get(j, i) + t * work[i]);
                  }
                }
              }
              if (wantv) {
                for (let i = k + 1; i < n; i++) {
                  V2.set(k, i, e[i]);
                }
              }
            }
          }
          let p = Math.min(n, m + 1);
          if (nct < n) {
            s[nct] = at.get(nct, nct);
          }
          if (m < p) {
            s[p - 1] = 0;
          }
          if (nrt + 1 < p) {
            e[nrt] = at.get(p - 1, nrt);
          }
          e[p - 1] = 0;
          if (wantu) {
            for (let j = nct; j < nu; j++) {
              for (let i = 0; i < m; i++) {
                U.set(j, i, 0);
              }
              U.set(j, j, 1);
            }
            for (let k = nct - 1; k >= 0; k--) {
              if (s[k] !== 0) {
                for (let j = k + 1; j < nu; j++) {
                  let t = 0;
                  for (let i = k; i < m; i++) {
                    t += U.get(k, i) * U.get(j, i);
                  }
                  t = -t / U.get(k, k);
                  for (let i = k; i < m; i++) {
                    U.set(j, i, U.get(j, i) + t * U.get(k, i));
                  }
                }
                for (let i = k; i < m; i++) {
                  U.set(k, i, -U.get(k, i));
                }
                U.set(k, k, 1 + U.get(k, k));
                for (let i = 0; i < k - 1; i++) {
                  U.set(k, i, 0);
                }
              } else {
                for (let i = 0; i < m; i++) {
                  U.set(k, i, 0);
                }
                U.set(k, k, 1);
              }
            }
          }
          if (wantv) {
            for (let k = n - 1; k >= 0; k--) {
              if (k < nrt && e[k] !== 0) {
                for (let j = k + 1; j < n; j++) {
                  let t = 0;
                  for (let i = k + 1; i < n; i++) {
                    t += V2.get(k, i) * V2.get(j, i);
                  }
                  t = -t / V2.get(k, k + 1);
                  for (let i = k + 1; i < n; i++) {
                    V2.set(j, i, V2.get(j, i) + t * V2.get(k, i));
                  }
                }
              }
              for (let i = 0; i < n; i++) {
                V2.set(k, i, 0);
              }
              V2.set(k, k, 1);
            }
          }
          let pp = p - 1;
          let eps = Number.EPSILON;
          while (p > 0) {
            let k, kase;
            for (k = p - 2; k >= -1; k--) {
              if (k === -1) {
                break;
              }
              const alpha = Number.MIN_VALUE + eps * Math.abs(s[k] + Math.abs(s[k + 1]));
              if (Math.abs(e[k]) <= alpha || Number.isNaN(e[k])) {
                e[k] = 0;
                break;
              }
            }
            if (k === p - 2) {
              kase = 4;
            } else {
              let ks;
              for (ks = p - 1; ks >= k; ks--) {
                if (ks === k) {
                  break;
                }
                let t = (ks !== p ? Math.abs(e[ks]) : 0) + (ks !== k + 1 ? Math.abs(e[ks - 1]) : 0);
                if (Math.abs(s[ks]) <= eps * t) {
                  s[ks] = 0;
                  break;
                }
              }
              if (ks === k) {
                kase = 3;
              } else if (ks === p - 1) {
                kase = 1;
              } else {
                kase = 2;
                k = ks;
              }
            }
            k++;
            switch (kase) {
              case 1: {
                let f = e[p - 2];
                e[p - 2] = 0;
                for (let j = p - 2; j >= k; j--) {
                  let t = hypotenuse(s[j], f);
                  let cs = s[j] / t;
                  let sn = f / t;
                  s[j] = t;
                  if (j !== k) {
                    f = -sn * e[j - 1];
                    e[j - 1] = cs * e[j - 1];
                  }
                  if (wantv) {
                    for (let i = 0; i < n; i++) {
                      t = cs * V2.get(j, i) + sn * V2.get(p - 1, i);
                      V2.set(p - 1, i, -sn * V2.get(j, i) + cs * V2.get(p - 1, i));
                      V2.set(j, i, t);
                    }
                  }
                }
                break;
              }
              case 2: {
                let f = e[k - 1];
                e[k - 1] = 0;
                for (let j = k; j < p; j++) {
                  let t = hypotenuse(s[j], f);
                  let cs = s[j] / t;
                  let sn = f / t;
                  s[j] = t;
                  f = -sn * e[j];
                  e[j] = cs * e[j];
                  if (wantu) {
                    for (let i = 0; i < m; i++) {
                      t = cs * U.get(j, i) + sn * U.get(k - 1, i);
                      U.set(k - 1, i, -sn * U.get(j, i) + cs * U.get(k - 1, i));
                      U.set(j, i, t);
                    }
                  }
                }
                break;
              }
              case 3: {
                const scale = Math.max(
                  Math.abs(s[p - 1]),
                  Math.abs(s[p - 2]),
                  Math.abs(e[p - 2]),
                  Math.abs(s[k]),
                  Math.abs(e[k])
                );
                const sp = s[p - 1] / scale;
                const spm1 = s[p - 2] / scale;
                const epm1 = e[p - 2] / scale;
                const sk = s[k] / scale;
                const ek = e[k] / scale;
                const b = ((spm1 + sp) * (spm1 - sp) + epm1 * epm1) / 2;
                const c = sp * epm1 * (sp * epm1);
                let shift = 0;
                if (b !== 0 || c !== 0) {
                  if (b < 0) {
                    shift = 0 - Math.sqrt(b * b + c);
                  } else {
                    shift = Math.sqrt(b * b + c);
                  }
                  shift = c / (b + shift);
                }
                let f = (sk + sp) * (sk - sp) + shift;
                let g = sk * ek;
                for (let j = k; j < p - 1; j++) {
                  let t = hypotenuse(f, g);
                  if (t === 0) t = Number.MIN_VALUE;
                  let cs = f / t;
                  let sn = g / t;
                  if (j !== k) {
                    e[j - 1] = t;
                  }
                  f = cs * s[j] + sn * e[j];
                  e[j] = cs * e[j] - sn * s[j];
                  g = sn * s[j + 1];
                  s[j + 1] = cs * s[j + 1];
                  if (wantv) {
                    for (let i = 0; i < n; i++) {
                      t = cs * V2.get(j, i) + sn * V2.get(j + 1, i);
                      V2.set(j + 1, i, -sn * V2.get(j, i) + cs * V2.get(j + 1, i));
                      V2.set(j, i, t);
                    }
                  }
                  t = hypotenuse(f, g);
                  if (t === 0) t = Number.MIN_VALUE;
                  cs = f / t;
                  sn = g / t;
                  s[j] = t;
                  f = cs * e[j] + sn * s[j + 1];
                  s[j + 1] = -sn * e[j] + cs * s[j + 1];
                  g = sn * e[j + 1];
                  e[j + 1] = cs * e[j + 1];
                  if (wantu && j < m - 1) {
                    for (let i = 0; i < m; i++) {
                      t = cs * U.get(j, i) + sn * U.get(j + 1, i);
                      U.set(j + 1, i, -sn * U.get(j, i) + cs * U.get(j + 1, i));
                      U.set(j, i, t);
                    }
                  }
                }
                e[p - 2] = f;
                break;
              }
              case 4: {
                if (s[k] <= 0) {
                  s[k] = s[k] < 0 ? -s[k] : 0;
                  if (wantv) {
                    for (let i = 0; i <= pp; i++) {
                      V2.set(k, i, -V2.get(k, i));
                    }
                  }
                }
                while (k < pp) {
                  if (s[k] >= s[k + 1]) {
                    break;
                  }
                  let t = s[k];
                  s[k] = s[k + 1];
                  s[k + 1] = t;
                  if (wantv && k < n - 1) {
                    for (let i = 0; i < n; i++) {
                      t = V2.get(k + 1, i);
                      V2.set(k + 1, i, V2.get(k, i));
                      V2.set(k, i, t);
                    }
                  }
                  if (wantu && k < m - 1) {
                    for (let i = 0; i < m; i++) {
                      t = U.get(k + 1, i);
                      U.set(k + 1, i, U.get(k, i));
                      U.set(k, i, t);
                    }
                  }
                  k++;
                }
                p--;
                break;
              }
            }
          }
          U = U.isSquare() ? transposeSquareInPlace(U) : U.transpose();
          V2 = transposeSquareInPlace(V2);
          if (swapped) {
            let tmp = V2;
            V2 = U;
            U = tmp;
          }
          this.m = m;
          this.n = n;
          this.s = s;
          this.U = U;
          this.V = V2;
        }
        solve(value) {
          let Y = value;
          let e = this.threshold;
          let scols = this.s.length;
          let Ls = Matrix3.zeros(scols, scols);
          for (let i = 0; i < scols; i++) {
            if (Math.abs(this.s[i]) <= e) {
              Ls.set(i, i, 0);
            } else {
              Ls.set(i, i, 1 / this.s[i]);
            }
          }
          let U = this.U;
          let V2 = this.rightSingularVectors;
          let VL = V2.mmul(Ls);
          let vrows = V2.rows;
          let urows = U.rows;
          let VLU = Matrix3.zeros(vrows, urows);
          for (let i = 0; i < vrows; i++) {
            for (let j = 0; j < urows; j++) {
              let sum2 = 0;
              for (let k = 0; k < scols; k++) {
                sum2 += VL.get(i, k) * U.get(j, k);
              }
              VLU.set(i, j, sum2);
            }
          }
          return VLU.mmul(Y);
        }
        solveForDiagonal(value) {
          return this.solve(Matrix3.diag(value));
        }
        inverse() {
          let V2 = this.V;
          let e = this.threshold;
          let vrows = V2.rows;
          let vcols = V2.columns;
          let X = new Matrix3(vrows, this.s.length);
          for (let i = 0; i < vrows; i++) {
            for (let j = 0; j < vcols; j++) {
              if (Math.abs(this.s[j]) > e) {
                X.set(i, j, V2.get(i, j) / this.s[j]);
              }
            }
          }
          let U = this.U;
          let urows = U.rows;
          let ucols = U.columns;
          let Y = new Matrix3(vrows, urows);
          for (let i = 0; i < vrows; i++) {
            for (let j = 0; j < urows; j++) {
              let sum2 = 0;
              for (let k = 0; k < ucols; k++) {
                sum2 += X.get(i, k) * U.get(j, k);
              }
              Y.set(i, j, sum2);
            }
          }
          return Y;
        }
        get condition() {
          return this.s[0] / this.s[Math.min(this.m, this.n) - 1];
        }
        get norm2() {
          return this.s[0];
        }
        get rank() {
          let tol = Math.max(this.m, this.n) * this.s[0] * Number.EPSILON;
          let r = 0;
          let s = this.s;
          for (let i = 0, ii = s.length; i < ii; i++) {
            if (s[i] > tol) {
              r++;
            }
          }
          return r;
        }
        get diagonal() {
          return Array.from(this.s);
        }
        get threshold() {
          return Number.EPSILON / 2 * Math.max(this.m, this.n) * this.s[0];
        }
        get leftSingularVectors() {
          return this.U;
        }
        get rightSingularVectors() {
          return this.V;
        }
        get diagonalMatrix() {
          return Matrix3.diag(this.s);
        }
      };
      function inverse2(matrix2, useSVD = false) {
        matrix2 = WrapperMatrix2D2.checkMatrix(matrix2);
        if (useSVD) {
          return new SingularValueDecomposition2(matrix2).inverse();
        } else {
          return solve2(matrix2, Matrix3.eye(matrix2.rows));
        }
      }
      function solve2(leftHandSide, rightHandSide, useSVD = false) {
        leftHandSide = WrapperMatrix2D2.checkMatrix(leftHandSide);
        rightHandSide = WrapperMatrix2D2.checkMatrix(rightHandSide);
        if (useSVD) {
          return new SingularValueDecomposition2(leftHandSide).solve(rightHandSide);
        } else {
          return leftHandSide.isSquare() ? new LuDecomposition2(leftHandSide).solve(rightHandSide) : new QrDecomposition2(leftHandSide).solve(rightHandSide);
        }
      }
      function determinant2(matrix2) {
        matrix2 = Matrix3.checkMatrix(matrix2);
        if (matrix2.isSquare()) {
          if (matrix2.columns === 0) {
            return 1;
          }
          let a, b, c, d;
          if (matrix2.columns === 2) {
            a = matrix2.get(0, 0);
            b = matrix2.get(0, 1);
            c = matrix2.get(1, 0);
            d = matrix2.get(1, 1);
            return a * d - b * c;
          } else if (matrix2.columns === 3) {
            let subMatrix0, subMatrix1, subMatrix2;
            subMatrix0 = new MatrixSelectionView2(matrix2, [1, 2], [1, 2]);
            subMatrix1 = new MatrixSelectionView2(matrix2, [1, 2], [0, 2]);
            subMatrix2 = new MatrixSelectionView2(matrix2, [1, 2], [0, 1]);
            a = matrix2.get(0, 0);
            b = matrix2.get(0, 1);
            c = matrix2.get(0, 2);
            return a * determinant2(subMatrix0) - b * determinant2(subMatrix1) + c * determinant2(subMatrix2);
          } else {
            return new LuDecomposition2(matrix2).determinant;
          }
        } else {
          throw Error("determinant can only be calculated for a square matrix");
        }
      }
      function xrange(n, exception) {
        let range = [];
        for (let i = 0; i < n; i++) {
          if (i !== exception) {
            range.push(i);
          }
        }
        return range;
      }
      function dependenciesOneRow(error, matrix2, index, thresholdValue = 1e-9, thresholdError = 1e-9) {
        if (error > thresholdError) {
          return new Array(matrix2.rows + 1).fill(0);
        } else {
          let returnArray = matrix2.addRow(index, [0]);
          for (let i = 0; i < returnArray.rows; i++) {
            if (Math.abs(returnArray.get(i, 0)) < thresholdValue) {
              returnArray.set(i, 0, 0);
            }
          }
          return returnArray.to1DArray();
        }
      }
      function linearDependencies2(matrix2, options = {}) {
        const { thresholdValue = 1e-9, thresholdError = 1e-9 } = options;
        matrix2 = Matrix3.checkMatrix(matrix2);
        let n = matrix2.rows;
        let results = new Matrix3(n, n);
        for (let i = 0; i < n; i++) {
          let b = Matrix3.columnVector(matrix2.getRow(i));
          let Abis = matrix2.subMatrixRow(xrange(n, i)).transpose();
          let svd = new SingularValueDecomposition2(Abis);
          let x = svd.solve(b);
          let scale = Matrix3.abs(b).max() || 1;
          let error = Matrix3.sub(b, Abis.mmul(x)).abs().max() / scale;
          results.setRow(
            i,
            dependenciesOneRow(error, x, i, thresholdValue, thresholdError)
          );
        }
        return results;
      }
      function pseudoInverse2(matrix2, threshold = Number.EPSILON) {
        matrix2 = Matrix3.checkMatrix(matrix2);
        if (matrix2.isEmpty()) {
          return matrix2.transpose();
        }
        let svdSolution = new SingularValueDecomposition2(matrix2, { autoTranspose: true });
        let U = svdSolution.leftSingularVectors;
        let V2 = svdSolution.rightSingularVectors;
        let s = svdSolution.diagonal;
        const cutoff = threshold * Math.max(matrix2.rows, matrix2.columns) * s[0];
        for (let i = 0; i < s.length; i++) {
          if (Math.abs(s[i]) > cutoff) {
            s[i] = 1 / s[i];
          } else {
            s[i] = 0;
          }
        }
        return V2.mmul(Matrix3.diag(s).mmul(U.transpose()));
      }
      function covariance2(xMatrix, yMatrix = xMatrix, options = {}) {
        xMatrix = new Matrix3(xMatrix);
        let yIsSame = false;
        if (typeof yMatrix === "object" && !Matrix3.isMatrix(yMatrix) && !isAnyArray(yMatrix)) {
          options = yMatrix;
          yMatrix = xMatrix;
          yIsSame = true;
        } else {
          yMatrix = new Matrix3(yMatrix);
        }
        if (xMatrix.rows !== yMatrix.rows) {
          throw new TypeError("Both matrices must have the same number of rows");
        }
        const { center = true } = options;
        if (center) {
          xMatrix = xMatrix.center("column");
          if (!yIsSame) {
            yMatrix = yMatrix.center("column");
          }
        }
        const cov = xMatrix.transposeMultiply(yMatrix);
        for (let i = 0; i < cov.rows; i++) {
          for (let j = 0; j < cov.columns; j++) {
            cov.set(i, j, cov.get(i, j) * (1 / (xMatrix.rows - 1)));
          }
        }
        return cov;
      }
      function correlation2(xMatrix, yMatrix = xMatrix, options = {}) {
        xMatrix = new Matrix3(xMatrix);
        let yIsSame = false;
        if (typeof yMatrix === "object" && !Matrix3.isMatrix(yMatrix) && !isAnyArray(yMatrix)) {
          options = yMatrix;
          yMatrix = xMatrix;
          yIsSame = true;
        } else {
          yMatrix = new Matrix3(yMatrix);
        }
        if (xMatrix.rows !== yMatrix.rows) {
          throw new TypeError("Both matrices must have the same number of rows");
        }
        const { center = true, scale = true } = options;
        if (center) {
          xMatrix.center("column");
          if (!yIsSame) {
            yMatrix.center("column");
          }
        }
        if (scale) {
          xMatrix.scale("column");
          if (!yIsSame) {
            yMatrix.scale("column");
          }
        }
        const sdx = xMatrix.standardDeviation("column", { unbiased: true });
        const sdy = yIsSame ? sdx : yMatrix.standardDeviation("column", { unbiased: true });
        const corr = xMatrix.transposeMultiply(yMatrix);
        for (let i = 0; i < corr.rows; i++) {
          for (let j = 0; j < corr.columns; j++) {
            corr.set(
              i,
              j,
              corr.get(i, j) * (1 / (sdx[i] * sdy[j])) * (1 / (xMatrix.rows - 1))
            );
          }
        }
        return corr;
      }
      var EigenvalueDecomposition3 = class {
        constructor(matrix2, options = {}) {
          const { assumeSymmetric = false } = options;
          matrix2 = WrapperMatrix2D2.checkMatrix(matrix2);
          if (!matrix2.isSquare()) {
            throw new Error("Matrix is not a square matrix");
          }
          if (matrix2.isEmpty()) {
            throw new Error("Matrix must be non-empty");
          }
          let n = matrix2.columns;
          let V2 = new Matrix3(n, n);
          let d = new Float64Array(n);
          let e = new Float64Array(n);
          let value = matrix2;
          let i, j;
          let isSymmetric = false;
          if (assumeSymmetric) {
            isSymmetric = true;
          } else {
            isSymmetric = matrix2.isSymmetric();
          }
          if (isSymmetric) {
            for (i = 0; i < n; i++) {
              for (j = 0; j < n; j++) {
                V2.set(j, i, value.get(i, j));
              }
            }
            tred2(n, e, d, V2);
            tql2(n, e, d, V2);
            transposeSquareInPlace(V2);
          } else {
            let H = new Matrix3(n, n);
            let ort = new Float64Array(n);
            for (j = 0; j < n; j++) {
              for (i = 0; i < n; i++) {
                H.set(i, j, value.get(i, j));
              }
            }
            orthes(n, H, ort, V2);
            hqr2(n, e, d, V2, H);
          }
          this.n = n;
          this.e = e;
          this.d = d;
          this.V = V2;
        }
        get realEigenvalues() {
          return Array.from(this.d);
        }
        get imaginaryEigenvalues() {
          return Array.from(this.e);
        }
        get eigenvectorMatrix() {
          return this.V;
        }
        get diagonalMatrix() {
          let n = this.n;
          let e = this.e;
          let d = this.d;
          let X = new Matrix3(n, n);
          let i, j;
          for (i = 0; i < n; i++) {
            for (j = 0; j < n; j++) {
              X.set(i, j, 0);
            }
            X.set(i, i, d[i]);
            if (e[i] > 0) {
              X.set(i, i + 1, e[i]);
            } else if (e[i] < 0) {
              X.set(i, i - 1, e[i]);
            }
          }
          return X;
        }
      };
      function tred2(n, e, d, V2) {
        let f, g, h, i, j, k, hh, scale;
        for (j = 0; j < n; j++) {
          d[j] = V2.get(j, n - 1);
        }
        for (i = n - 1; i > 0; i--) {
          scale = 0;
          h = 0;
          for (k = 0; k < i; k++) {
            scale = scale + Math.abs(d[k]);
          }
          if (scale === 0) {
            e[i] = d[i - 1];
            for (j = 0; j < i; j++) {
              d[j] = V2.get(j, i - 1);
              V2.set(j, i, 0);
              V2.set(i, j, 0);
            }
          } else {
            for (k = 0; k < i; k++) {
              d[k] /= scale;
              h += d[k] * d[k];
            }
            f = d[i - 1];
            g = Math.sqrt(h);
            if (f > 0) {
              g = -g;
            }
            e[i] = scale * g;
            h = h - f * g;
            d[i - 1] = f - g;
            for (j = 0; j < i; j++) {
              e[j] = 0;
            }
            for (j = 0; j < i; j++) {
              f = d[j];
              V2.set(i, j, f);
              g = e[j] + V2.get(j, j) * f;
              for (k = j + 1; k <= i - 1; k++) {
                g += V2.get(j, k) * d[k];
                e[k] += V2.get(j, k) * f;
              }
              e[j] = g;
            }
            f = 0;
            for (j = 0; j < i; j++) {
              e[j] /= h;
              f += e[j] * d[j];
            }
            hh = f / (h + h);
            for (j = 0; j < i; j++) {
              e[j] -= hh * d[j];
            }
            for (j = 0; j < i; j++) {
              f = d[j];
              g = e[j];
              for (k = j; k <= i - 1; k++) {
                V2.set(j, k, V2.get(j, k) - (f * e[k] + g * d[k]));
              }
              d[j] = V2.get(j, i - 1);
              V2.set(j, i, 0);
            }
          }
          d[i] = h;
        }
        for (i = 0; i < n - 1; i++) {
          V2.set(i, n - 1, V2.get(i, i));
          V2.set(i, i, 1);
          h = d[i + 1];
          if (h !== 0) {
            for (k = 0; k <= i; k++) {
              d[k] = V2.get(i + 1, k) / h;
            }
            for (j = 0; j <= i; j++) {
              g = 0;
              for (k = 0; k <= i; k++) {
                g += V2.get(i + 1, k) * V2.get(j, k);
              }
              for (k = 0; k <= i; k++) {
                V2.set(j, k, V2.get(j, k) - g * d[k]);
              }
            }
          }
          for (k = 0; k <= i; k++) {
            V2.set(i + 1, k, 0);
          }
        }
        for (j = 0; j < n; j++) {
          d[j] = V2.get(j, n - 1);
          V2.set(j, n - 1, 0);
        }
        V2.set(n - 1, n - 1, 1);
        e[0] = 0;
      }
      function tql2(n, e, d, V2) {
        let g, h, i, j, k, l, m, p, r, dl1, c, c2, c3, el1, s, s2;
        for (i = 1; i < n; i++) {
          e[i - 1] = e[i];
        }
        e[n - 1] = 0;
        let f = 0;
        let tst1 = 0;
        let eps = Number.EPSILON;
        for (l = 0; l < n; l++) {
          tst1 = Math.max(tst1, Math.abs(d[l]) + Math.abs(e[l]));
          m = l;
          while (m < n) {
            if (Math.abs(e[m]) <= eps * tst1) {
              break;
            }
            m++;
          }
          if (m > l) {
            do {
              g = d[l];
              p = (d[l + 1] - g) / (2 * e[l]);
              r = hypotenuse(p, 1);
              if (p < 0) {
                r = -r;
              }
              d[l] = e[l] / (p + r);
              d[l + 1] = e[l] * (p + r);
              dl1 = d[l + 1];
              h = g - d[l];
              for (i = l + 2; i < n; i++) {
                d[i] -= h;
              }
              f = f + h;
              p = d[m];
              c = 1;
              c2 = c;
              c3 = c;
              el1 = e[l + 1];
              s = 0;
              s2 = 0;
              for (i = m - 1; i >= l; i--) {
                c3 = c2;
                c2 = c;
                s2 = s;
                g = c * e[i];
                h = c * p;
                r = hypotenuse(p, e[i]);
                e[i + 1] = s * r;
                s = e[i] / r;
                c = p / r;
                p = c * d[i] - s * g;
                d[i + 1] = h + s * (c * g + s * d[i]);
                for (k = 0; k < n; k++) {
                  h = V2.get(i + 1, k);
                  V2.set(i + 1, k, s * V2.get(i, k) + c * h);
                  V2.set(i, k, c * V2.get(i, k) - s * h);
                }
              }
              p = -s * s2 * c3 * el1 * e[l] / dl1;
              e[l] = s * p;
              d[l] = c * p;
            } while (Math.abs(e[l]) > eps * tst1);
          }
          d[l] = d[l] + f;
          e[l] = 0;
        }
        for (i = 0; i < n - 1; i++) {
          k = i;
          p = d[i];
          for (j = i + 1; j < n; j++) {
            if (d[j] < p) {
              k = j;
              p = d[j];
            }
          }
          if (k !== i) {
            d[k] = d[i];
            d[i] = p;
            for (j = 0; j < n; j++) {
              p = V2.get(i, j);
              V2.set(i, j, V2.get(k, j));
              V2.set(k, j, p);
            }
          }
        }
      }
      function orthes(n, H, ort, V2) {
        let low = 0;
        let high = n - 1;
        let f, g, h, i, j, m;
        let scale;
        for (m = low + 1; m <= high - 1; m++) {
          scale = 0;
          for (i = m; i <= high; i++) {
            scale = scale + Math.abs(H.get(i, m - 1));
          }
          if (scale !== 0) {
            h = 0;
            for (i = high; i >= m; i--) {
              ort[i] = H.get(i, m - 1) / scale;
              h += ort[i] * ort[i];
            }
            g = Math.sqrt(h);
            if (ort[m] > 0) {
              g = -g;
            }
            h = h - ort[m] * g;
            ort[m] = ort[m] - g;
            for (j = m; j < n; j++) {
              f = 0;
              for (i = high; i >= m; i--) {
                f += ort[i] * H.get(i, j);
              }
              f = f / h;
              for (i = m; i <= high; i++) {
                H.set(i, j, H.get(i, j) - f * ort[i]);
              }
            }
            for (i = 0; i <= high; i++) {
              f = 0;
              for (j = high; j >= m; j--) {
                f += ort[j] * H.get(i, j);
              }
              f = f / h;
              for (j = m; j <= high; j++) {
                H.set(i, j, H.get(i, j) - f * ort[j]);
              }
            }
            ort[m] = scale * ort[m];
            H.set(m, m - 1, scale * g);
          }
        }
        for (i = 0; i < n; i++) {
          for (j = 0; j < n; j++) {
            V2.set(i, j, i === j ? 1 : 0);
          }
        }
        for (m = high - 1; m >= low + 1; m--) {
          if (H.get(m, m - 1) !== 0) {
            for (i = m + 1; i <= high; i++) {
              ort[i] = H.get(i, m - 1);
            }
            for (j = m; j <= high; j++) {
              g = 0;
              for (i = m; i <= high; i++) {
                g += ort[i] * V2.get(i, j);
              }
              g = g / ort[m] / H.get(m, m - 1);
              for (i = m; i <= high; i++) {
                V2.set(i, j, V2.get(i, j) + g * ort[i]);
              }
            }
          }
        }
      }
      function hqr2(nn, e, d, V2, H) {
        let n = nn - 1;
        let low = 0;
        let high = nn - 1;
        let eps = Number.EPSILON;
        let exshift = 0;
        let norm = 0;
        let p = 0;
        let q = 0;
        let r = 0;
        let s = 0;
        let z = 0;
        let iter = 0;
        let i, j, k, l, m, t, w, x, y;
        let ra, sa, vr, vi;
        let notlast, cdivres;
        for (i = 0; i < nn; i++) {
          if (i < low || i > high) {
            d[i] = H.get(i, i);
            e[i] = 0;
          }
          for (j = Math.max(i - 1, 0); j < nn; j++) {
            norm = norm + Math.abs(H.get(i, j));
          }
        }
        while (n >= low) {
          l = n;
          while (l > low) {
            s = Math.abs(H.get(l - 1, l - 1)) + Math.abs(H.get(l, l));
            if (s === 0) {
              s = norm;
            }
            if (Math.abs(H.get(l, l - 1)) < eps * s) {
              break;
            }
            l--;
          }
          if (l === n) {
            H.set(n, n, H.get(n, n) + exshift);
            d[n] = H.get(n, n);
            e[n] = 0;
            n--;
            iter = 0;
          } else if (l === n - 1) {
            w = H.get(n, n - 1) * H.get(n - 1, n);
            p = (H.get(n - 1, n - 1) - H.get(n, n)) / 2;
            q = p * p + w;
            z = Math.sqrt(Math.abs(q));
            H.set(n, n, H.get(n, n) + exshift);
            H.set(n - 1, n - 1, H.get(n - 1, n - 1) + exshift);
            x = H.get(n, n);
            if (q >= 0) {
              z = p >= 0 ? p + z : p - z;
              d[n - 1] = x + z;
              d[n] = d[n - 1];
              if (z !== 0) {
                d[n] = x - w / z;
              }
              e[n - 1] = 0;
              e[n] = 0;
              x = H.get(n, n - 1);
              s = Math.abs(x) + Math.abs(z);
              p = x / s;
              q = z / s;
              r = Math.sqrt(p * p + q * q);
              p = p / r;
              q = q / r;
              for (j = n - 1; j < nn; j++) {
                z = H.get(n - 1, j);
                H.set(n - 1, j, q * z + p * H.get(n, j));
                H.set(n, j, q * H.get(n, j) - p * z);
              }
              for (i = 0; i <= n; i++) {
                z = H.get(i, n - 1);
                H.set(i, n - 1, q * z + p * H.get(i, n));
                H.set(i, n, q * H.get(i, n) - p * z);
              }
              for (i = low; i <= high; i++) {
                z = V2.get(i, n - 1);
                V2.set(i, n - 1, q * z + p * V2.get(i, n));
                V2.set(i, n, q * V2.get(i, n) - p * z);
              }
            } else {
              d[n - 1] = x + p;
              d[n] = x + p;
              e[n - 1] = z;
              e[n] = -z;
            }
            n = n - 2;
            iter = 0;
          } else {
            x = H.get(n, n);
            y = 0;
            w = 0;
            if (l < n) {
              y = H.get(n - 1, n - 1);
              w = H.get(n, n - 1) * H.get(n - 1, n);
            }
            if (iter === 10) {
              exshift += x;
              for (i = low; i <= n; i++) {
                H.set(i, i, H.get(i, i) - x);
              }
              s = Math.abs(H.get(n, n - 1)) + Math.abs(H.get(n - 1, n - 2));
              x = y = 0.75 * s;
              w = -0.4375 * s * s;
            }
            if (iter === 30) {
              s = (y - x) / 2;
              s = s * s + w;
              if (s > 0) {
                s = Math.sqrt(s);
                if (y < x) {
                  s = -s;
                }
                s = x - w / ((y - x) / 2 + s);
                for (i = low; i <= n; i++) {
                  H.set(i, i, H.get(i, i) - s);
                }
                exshift += s;
                x = y = w = 0.964;
              }
            }
            iter = iter + 1;
            m = n - 2;
            while (m >= l) {
              z = H.get(m, m);
              r = x - z;
              s = y - z;
              p = (r * s - w) / H.get(m + 1, m) + H.get(m, m + 1);
              q = H.get(m + 1, m + 1) - z - r - s;
              r = H.get(m + 2, m + 1);
              s = Math.abs(p) + Math.abs(q) + Math.abs(r);
              p = p / s;
              q = q / s;
              r = r / s;
              if (m === l) {
                break;
              }
              if (Math.abs(H.get(m, m - 1)) * (Math.abs(q) + Math.abs(r)) < eps * (Math.abs(p) * (Math.abs(H.get(m - 1, m - 1)) + Math.abs(z) + Math.abs(H.get(m + 1, m + 1))))) {
                break;
              }
              m--;
            }
            for (i = m + 2; i <= n; i++) {
              H.set(i, i - 2, 0);
              if (i > m + 2) {
                H.set(i, i - 3, 0);
              }
            }
            for (k = m; k <= n - 1; k++) {
              notlast = k !== n - 1;
              if (k !== m) {
                p = H.get(k, k - 1);
                q = H.get(k + 1, k - 1);
                r = notlast ? H.get(k + 2, k - 1) : 0;
                x = Math.abs(p) + Math.abs(q) + Math.abs(r);
                if (x !== 0) {
                  p = p / x;
                  q = q / x;
                  r = r / x;
                }
              }
              if (x === 0) {
                break;
              }
              s = Math.sqrt(p * p + q * q + r * r);
              if (p < 0) {
                s = -s;
              }
              if (s !== 0) {
                if (k !== m) {
                  H.set(k, k - 1, -s * x);
                } else if (l !== m) {
                  H.set(k, k - 1, -H.get(k, k - 1));
                }
                p = p + s;
                x = p / s;
                y = q / s;
                z = r / s;
                q = q / p;
                r = r / p;
                for (j = k; j < nn; j++) {
                  p = H.get(k, j) + q * H.get(k + 1, j);
                  if (notlast) {
                    p = p + r * H.get(k + 2, j);
                    H.set(k + 2, j, H.get(k + 2, j) - p * z);
                  }
                  H.set(k, j, H.get(k, j) - p * x);
                  H.set(k + 1, j, H.get(k + 1, j) - p * y);
                }
                for (i = 0; i <= Math.min(n, k + 3); i++) {
                  p = x * H.get(i, k) + y * H.get(i, k + 1);
                  if (notlast) {
                    p = p + z * H.get(i, k + 2);
                    H.set(i, k + 2, H.get(i, k + 2) - p * r);
                  }
                  H.set(i, k, H.get(i, k) - p);
                  H.set(i, k + 1, H.get(i, k + 1) - p * q);
                }
                for (i = low; i <= high; i++) {
                  p = x * V2.get(i, k) + y * V2.get(i, k + 1);
                  if (notlast) {
                    p = p + z * V2.get(i, k + 2);
                    V2.set(i, k + 2, V2.get(i, k + 2) - p * r);
                  }
                  V2.set(i, k, V2.get(i, k) - p);
                  V2.set(i, k + 1, V2.get(i, k + 1) - p * q);
                }
              }
            }
          }
        }
        if (norm === 0) {
          return;
        }
        for (n = nn - 1; n >= 0; n--) {
          p = d[n];
          q = e[n];
          if (q === 0) {
            l = n;
            H.set(n, n, 1);
            for (i = n - 1; i >= 0; i--) {
              w = H.get(i, i) - p;
              r = 0;
              for (j = l; j <= n; j++) {
                r = r + H.get(i, j) * H.get(j, n);
              }
              if (e[i] < 0) {
                z = w;
                s = r;
              } else {
                l = i;
                if (e[i] === 0) {
                  H.set(i, n, w !== 0 ? -r / w : -r / (eps * norm));
                } else {
                  x = H.get(i, i + 1);
                  y = H.get(i + 1, i);
                  q = (d[i] - p) * (d[i] - p) + e[i] * e[i];
                  t = (x * s - z * r) / q;
                  H.set(i, n, t);
                  H.set(
                    i + 1,
                    n,
                    Math.abs(x) > Math.abs(z) ? (-r - w * t) / x : (-s - y * t) / z
                  );
                }
                t = Math.abs(H.get(i, n));
                if (eps * t * t > 1) {
                  for (j = i; j <= n; j++) {
                    H.set(j, n, H.get(j, n) / t);
                  }
                }
              }
            }
          } else if (q < 0) {
            l = n - 1;
            if (Math.abs(H.get(n, n - 1)) > Math.abs(H.get(n - 1, n))) {
              H.set(n - 1, n - 1, q / H.get(n, n - 1));
              H.set(n - 1, n, -(H.get(n, n) - p) / H.get(n, n - 1));
            } else {
              cdivres = cdiv(0, -H.get(n - 1, n), H.get(n - 1, n - 1) - p, q);
              H.set(n - 1, n - 1, cdivres[0]);
              H.set(n - 1, n, cdivres[1]);
            }
            H.set(n, n - 1, 0);
            H.set(n, n, 1);
            for (i = n - 2; i >= 0; i--) {
              ra = 0;
              sa = 0;
              for (j = l; j <= n; j++) {
                ra = ra + H.get(i, j) * H.get(j, n - 1);
                sa = sa + H.get(i, j) * H.get(j, n);
              }
              w = H.get(i, i) - p;
              if (e[i] < 0) {
                z = w;
                r = ra;
                s = sa;
              } else {
                l = i;
                if (e[i] === 0) {
                  cdivres = cdiv(-ra, -sa, w, q);
                  H.set(i, n - 1, cdivres[0]);
                  H.set(i, n, cdivres[1]);
                } else {
                  x = H.get(i, i + 1);
                  y = H.get(i + 1, i);
                  vr = (d[i] - p) * (d[i] - p) + e[i] * e[i] - q * q;
                  vi = (d[i] - p) * 2 * q;
                  if (vr === 0 && vi === 0) {
                    vr = eps * norm * (Math.abs(w) + Math.abs(q) + Math.abs(x) + Math.abs(y) + Math.abs(z));
                  }
                  cdivres = cdiv(
                    x * r - z * ra + q * sa,
                    x * s - z * sa - q * ra,
                    vr,
                    vi
                  );
                  H.set(i, n - 1, cdivres[0]);
                  H.set(i, n, cdivres[1]);
                  if (Math.abs(x) > Math.abs(z) + Math.abs(q)) {
                    H.set(
                      i + 1,
                      n - 1,
                      (-ra - w * H.get(i, n - 1) + q * H.get(i, n)) / x
                    );
                    H.set(
                      i + 1,
                      n,
                      (-sa - w * H.get(i, n) - q * H.get(i, n - 1)) / x
                    );
                  } else {
                    cdivres = cdiv(
                      -r - y * H.get(i, n - 1),
                      -s - y * H.get(i, n),
                      z,
                      q
                    );
                    H.set(i + 1, n - 1, cdivres[0]);
                    H.set(i + 1, n, cdivres[1]);
                  }
                }
                t = Math.max(Math.abs(H.get(i, n - 1)), Math.abs(H.get(i, n)));
                if (eps * t * t > 1) {
                  for (j = i; j <= n; j++) {
                    H.set(j, n - 1, H.get(j, n - 1) / t);
                    H.set(j, n, H.get(j, n) / t);
                  }
                }
              }
            }
          }
        }
        for (i = 0; i < nn; i++) {
          if (i < low || i > high) {
            for (j = i; j < nn; j++) {
              V2.set(i, j, H.get(i, j));
            }
          }
        }
        for (j = nn - 1; j >= low; j--) {
          for (i = low; i <= high; i++) {
            z = 0;
            for (k = low; k <= Math.min(j, high); k++) {
              z = z + V2.get(i, k) * H.get(k, j);
            }
            V2.set(i, j, z);
          }
        }
      }
      function cdiv(xr, xi, yr, yi) {
        let r, d;
        if (Math.abs(yr) > Math.abs(yi)) {
          r = yi / yr;
          d = yr + r * yi;
          return [(xr + r * xi) / d, (xi - r * xr) / d];
        } else {
          r = yr / yi;
          d = yi + r * yr;
          return [(r * xr + xi) / d, (r * xi - xr) / d];
        }
      }
      var CholeskyDecomposition2 = class {
        constructor(value) {
          value = WrapperMatrix2D2.checkMatrix(value);
          if (!value.isSymmetric()) {
            throw new Error("Matrix is not symmetric");
          }
          let a = value;
          let dimension = a.rows;
          let l = new Matrix3(dimension, dimension);
          let positiveDefinite = true;
          let i, j, k;
          for (j = 0; j < dimension; j++) {
            let d = 0;
            for (k = 0; k < j; k++) {
              let s = 0;
              for (i = 0; i < k; i++) {
                s += l.get(k, i) * l.get(j, i);
              }
              s = (a.get(j, k) - s) / l.get(k, k);
              l.set(j, k, s);
              d = d + s * s;
            }
            d = a.get(j, j) - d;
            positiveDefinite && (positiveDefinite = d > 0);
            l.set(j, j, Math.sqrt(Math.max(d, 0)));
            for (k = j + 1; k < dimension; k++) {
              l.set(j, k, 0);
            }
          }
          this.L = l;
          this.positiveDefinite = positiveDefinite;
        }
        isPositiveDefinite() {
          return this.positiveDefinite;
        }
        solve(value) {
          value = WrapperMatrix2D2.checkMatrix(value);
          let l = this.L;
          let dimension = l.rows;
          if (value.rows !== dimension) {
            throw new Error("Matrix dimensions do not match");
          }
          if (this.isPositiveDefinite() === false) {
            throw new Error("Matrix is not positive definite");
          }
          let count = value.columns;
          let B = value.clone();
          let i, j, k;
          for (k = 0; k < dimension; k++) {
            for (j = 0; j < count; j++) {
              for (i = 0; i < k; i++) {
                B.set(k, j, B.get(k, j) - B.get(i, j) * l.get(k, i));
              }
              B.set(k, j, B.get(k, j) / l.get(k, k));
            }
          }
          for (k = dimension - 1; k >= 0; k--) {
            for (j = 0; j < count; j++) {
              for (i = k + 1; i < dimension; i++) {
                B.set(k, j, B.get(k, j) - B.get(i, j) * l.get(i, k));
              }
              B.set(k, j, B.get(k, j) / l.get(k, k));
            }
          }
          return B;
        }
        get lowerTriangularMatrix() {
          return this.L;
        }
      };
      var nipals = class {
        constructor(X, options = {}) {
          X = WrapperMatrix2D2.checkMatrix(X);
          let { Y } = options;
          const {
            scaleScores = false,
            maxIterations = 1e3,
            terminationCriteria = 1e-10
          } = options;
          let u;
          if (Y) {
            if (isAnyArray(Y) && typeof Y[0] === "number") {
              Y = Matrix3.columnVector(Y);
            } else {
              Y = WrapperMatrix2D2.checkMatrix(Y);
            }
            if (Y.rows !== X.rows) {
              throw new Error("Y should have the same number of rows as X");
            }
            u = Y.getColumnVector(0);
          } else {
            u = X.getColumnVector(0);
          }
          let diff = 1;
          let t, q, w, tOld;
          for (let counter = 0; counter < maxIterations && diff > terminationCriteria; counter++) {
            w = X.transpose().mmul(u).div(u.transpose().mmul(u).get(0, 0));
            w = w.div(w.norm());
            t = X.mmul(w).div(w.transpose().mmul(w).get(0, 0));
            if (counter > 0) {
              diff = t.clone().sub(tOld).pow(2).sum();
            }
            tOld = t.clone();
            if (Y) {
              q = Y.transpose().mmul(t).div(t.transpose().mmul(t).get(0, 0));
              q = q.div(q.norm());
              u = Y.mmul(q).div(q.transpose().mmul(q).get(0, 0));
            } else {
              u = t;
            }
          }
          if (Y) {
            let p = X.transpose().mmul(t).div(t.transpose().mmul(t).get(0, 0));
            p = p.div(p.norm());
            let xResidual = X.clone().sub(t.clone().mmul(p.transpose()));
            let residual = u.transpose().mmul(t).div(t.transpose().mmul(t).get(0, 0));
            let yResidual = Y.clone().sub(
              t.clone().mulS(residual.get(0, 0)).mmul(q.transpose())
            );
            this.t = t;
            this.p = p.transpose();
            this.w = w.transpose();
            this.q = q;
            this.u = u;
            this.s = t.transpose().mmul(t);
            this.xResidual = xResidual;
            this.yResidual = yResidual;
            this.betas = residual;
          } else {
            this.w = w.transpose();
            this.s = t.transpose().mmul(t).sqrt();
            if (scaleScores) {
              this.t = t.clone().div(this.s.get(0, 0));
            } else {
              this.t = t;
            }
            this.xResidual = X.sub(t.mmul(w.transpose()));
          }
        }
      };
      exports.AbstractMatrix = AbstractMatrix2;
      exports.CHO = CholeskyDecomposition2;
      exports.CholeskyDecomposition = CholeskyDecomposition2;
      exports.DistanceMatrix = DistanceMatrix2;
      exports.EVD = EigenvalueDecomposition3;
      exports.EigenvalueDecomposition = EigenvalueDecomposition3;
      exports.LU = LuDecomposition2;
      exports.LuDecomposition = LuDecomposition2;
      exports.Matrix = Matrix3;
      exports.MatrixColumnSelectionView = MatrixColumnSelectionView2;
      exports.MatrixColumnView = MatrixColumnView2;
      exports.MatrixFlipColumnView = MatrixFlipColumnView2;
      exports.MatrixFlipRowView = MatrixFlipRowView2;
      exports.MatrixRowSelectionView = MatrixRowSelectionView2;
      exports.MatrixRowView = MatrixRowView2;
      exports.MatrixSelectionView = MatrixSelectionView2;
      exports.MatrixSubView = MatrixSubView2;
      exports.MatrixTransposeView = MatrixTransposeView2;
      exports.NIPALS = nipals;
      exports.Nipals = nipals;
      exports.QR = QrDecomposition2;
      exports.QrDecomposition = QrDecomposition2;
      exports.SVD = SingularValueDecomposition2;
      exports.SingularValueDecomposition = SingularValueDecomposition2;
      exports.SymmetricMatrix = SymmetricMatrix2;
      exports.WrapperMatrix1D = WrapperMatrix1D2;
      exports.WrapperMatrix2D = WrapperMatrix2D2;
      exports.correlation = correlation2;
      exports.covariance = covariance2;
      exports.default = Matrix3;
      exports.determinant = determinant2;
      exports.inverse = inverse2;
      exports.linearDependencies = linearDependencies2;
      exports.pseudoInverse = pseudoInverse2;
      exports.solve = solve2;
      exports.wrap = wrap2;
    }
  });

  // scripts/analysis-errors.mjs
  function analysisErrorMessage(problem, fallback = "The analysis worker stopped without an error message. Reload and retry, or choose a smaller source scope.") {
    const candidates = typeof problem === "string" ? [problem] : [problem?.message, problem?.error?.message, problem?.error, problem?.reason];
    for (const candidate of candidates) {
      if (typeof candidate !== "string") continue;
      const message = candidate.trim();
      if (message && !["undefined", "null", "[object Object]"].includes(message)) return message;
    }
    return fallback;
  }

  // node_modules/ngraph.leiden/dist/ngraph-leiden.es.js
  var V = { exports: {} };
  var Z;
  function rt() {
    if (Z) return V.exports;
    Z = 1, V.exports = t, V.exports.random = t, V.exports.randomIterator = c;
    function t(e) {
      var s = typeof e == "number" ? e : +/* @__PURE__ */ new Date();
      return new n(s);
    }
    function n(e) {
      this.seed = e;
    }
    n.prototype.next = f, n.prototype.nextDouble = i, n.prototype.uniform = i, n.prototype.gaussian = o, n.prototype.random = i;
    function o() {
      var e, s, y;
      do
        s = this.nextDouble() * 2 - 1, y = this.nextDouble() * 2 - 1, e = s * s + y * y;
      while (e >= 1 || e === 0);
      return s * Math.sqrt(-2 * Math.log(e) / e);
    }
    n.prototype.levy = u;
    function u() {
      var e = 1.5, s = Math.pow(
        r(1 + e) * Math.sin(Math.PI * e / 2) / (r((1 + e) / 2) * e * Math.pow(2, (e - 1) / 2)),
        1 / e
      );
      return this.gaussian() * s / Math.pow(Math.abs(this.gaussian()), 1 / e);
    }
    function r(e) {
      return Math.sqrt(2 * Math.PI / e) * Math.pow(1 / Math.E * (e + 1 / (12 * e - 1 / (10 * e))), e);
    }
    function i() {
      var e = this.seed;
      return e = e + 2127912214 + (e << 12) & 4294967295, e = (e ^ 3345072700 ^ e >>> 19) & 4294967295, e = e + 374761393 + (e << 5) & 4294967295, e = (e + 3550635116 ^ e << 9) & 4294967295, e = e + 4251993797 + (e << 3) & 4294967295, e = (e ^ 3042594569 ^ e >>> 16) & 4294967295, this.seed = e, (e & 268435455) / 268435456;
    }
    function f(e) {
      return Math.floor(this.nextDouble() * e);
    }
    function c(e, s) {
      var y = s || t();
      if (typeof y.next != "function")
        throw new Error("customRandom does not match expected API: next() function is missing");
      return {
        /**
         * Visits every single element of a collection once, in a random order.
         * Note: collection is modified in place.
         */
        forEach: C,
        /**
         * Shuffles array randomly, in place.
         */
        shuffle: I
      };
      function I() {
        var w, h, g;
        for (w = e.length - 1; w > 0; --w)
          h = y.next(w + 1), g = e[h], e[h] = e[w], e[w] = g;
        return e;
      }
      function C(w) {
        var h, g, b;
        for (h = e.length - 1; h > 0; --h)
          g = y.next(h + 1), b = e[g], e[g] = e[h], e[h] = b, w(b);
        e.length && w(e[0]);
      }
    }
    return V.exports;
  }
  var ct = rt();

  // scripts/community-methods.mjs
  function canonicalMemberships(memberships) {
    const groups = /* @__PURE__ */ new Map();
    for (const [id, group] of Object.entries(memberships)) {
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(id);
    }
    return Object.fromEntries([...groups.values()].map((members) => members.sort()).sort((left, right) => right.length - left.length || left[0].localeCompare(right[0])).flatMap((members, position) => members.map((id) => [id, position + 1])));
  }
  function buildHyperedges(graph, bundles, limit = 2e4) {
    const nodes = new Map(graph.nodes.map((node) => [node.id, node])), combinations = /* @__PURE__ */ new Map();
    const add = (members) => {
      const key = JSON.stringify(members);
      if (combinations.has(key)) return;
      if (combinations.size >= limit) throw new Error(`More than ${limit.toLocaleString()} exact combinations. Choose a smaller reference scope or a single lower order; no truncated hypergraph was clustered.`);
      combinations.set(key, members);
    };
    if (graph.order === 2 || graph.order === "all") for (const edge of graph.links) add([edge.source, edge.target].sort());
    if (graph.order !== 2) for (const bundle of bundles) {
      const members = [...new Set(bundle.members.filter((id) => nodes.has(id)))].sort(), minimum = graph.order === "all" ? 3 : graph.order, maximum = graph.order === "all" ? Math.min(graph.maximumOrder, members.length) : graph.order;
      for (let order = minimum; order <= maximum && order <= members.length; order++) {
        const visit = (offset, chosen) => {
          if (chosen.length === order) {
            add(chosen);
            return;
          }
          for (let position = offset; position <= members.length - (order - chosen.length); position++) visit(position + 1, [...chosen, members[position]]);
        };
        visit(0, []);
      }
    }
    const postings = new Map(graph.nodes.map((node) => [node.id, new Set(node.articles || [])])), hyperedges = [];
    for (const [key, members] of combinations) {
      const first = [...members].sort((left, right) => postings.get(left).size - postings.get(right).size)[0];
      const articles = [...postings.get(first)].filter((article) => members.every((id) => postings.get(id).has(article))).sort();
      if (articles.length >= (graph.minimumSupport || 5)) hyperedges.push({ id: key, members, articles });
    }
    const occurrences = /* @__PURE__ */ new Map();
    for (const edge of hyperedges) for (const article of edge.articles) occurrences.set(article, (occurrences.get(article) || 0) + 1);
    for (const edge of hyperedges) edge.weight = edge.articles.reduce((sum2, article) => sum2 + 1 / occurrences.get(article), 0);
    return hyperedges;
  }

  // node_modules/ml-matrix/matrix.mjs
  var matrix = __toESM(require_matrix(), 1);
  var EigenvalueDecomposition2 = matrix.EigenvalueDecomposition;
  var Matrix2 = matrix.Matrix;
  var matrix_default = matrix.default.Matrix ? matrix.default.Matrix : matrix.Matrix;

  // scripts/hypergraph-trials.mjs
  var TRIAL_VERSION = "hypergraph-trials-v2";
  var TRIAL_METHODS = {
    spectral: { name: "Spectral \xB7 normalized cut", score: "Zhou normalized-cut relaxation", search: "Symmetric eigendecomposition + k-means", help: "Embed articles using the weighted incidence Laplacian, then group the embedding. Eigenvector accuracy is checked explicitly. This is a matrix method, not a tensor method.", reference: "https://papers.neurips.cc/paper/3128-learning-with-hypergraphs-clustering-classification-and-embedding.pdf" },
    aon: { name: "Degree-adjusted AON \xB7 approximation", score: "Assortative AON weighted profile objective", search: "Seeded vertex coordinate ascent", help: "Estimate within/outside rates for each combination size, with fixed degree-derived propensities. Fractional evidence weights make this a quasi-likelihood trial, NOT a full jointly fitted DCHSBM or an MDL-selected hierarchy.", reference: "https://arxiv.org/abs/2101.09611" },
    balanced: { name: "Balanced hyperedge cut", score: "Weighted cut-net cost with size bounds", search: "Balanced initialization + vertex/swap refinement", help: "Request k roughly balanced groups while cutting as little whole-combination weight as possible. This custom bounded heuristic is not hMETIS, KaHyPar or their multilevel algorithms. Equal-size constraints can split natural communities.", reference: "https://kahypar.org/" },
    local: { name: "Local \xB7 explore around an article", score: "Whole-hyperedge conductance", search: "Incidence PageRank + seed-containing sweep", help: "Return one neighborhood around a seed. The random walk includes self-returns; the sweep evaluates whole cut hyperedges. This is a custom diffusion/sweep trial, not the published flow solver.", reference: "https://www.cs.cornell.edu/~arb/papers/hypergraph-ratio-cut-KDD-2020.pdf" },
    categorical: { name: "Categorical \xB7 source-period demo", score: "Weight of category-consistent whole hyperedges", search: "Seeded categorical label moves", help: "Label each combination by the most common publication decade among its supporting sources, then seek agreement with those labels. These are constructed period categories, NOT semantic themes. This is a heuristic, not the paper\u2019s approximation algorithm or a tensor decomposition.", reference: "https://www.cs.cornell.edu/~arb/papers/cat-edge-clus-WWW-2020.pdf" }
  };
  var sum = (values) => values.reduce((total, value) => total + value, 0);
  var dot = (left, right) => left.reduce((total, value, index) => total + value * right[index], 0);
  var rng = (seed) => {
    let state = seed >>> 0;
    return () => {
      state = Math.imul(state, 1664525) + 1013904223 >>> 0;
      return state / 4294967296;
    };
  };
  var shuffle = (values, random) => {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [copy[index], copy[other]] = [copy[other], copy[index]];
    }
    return copy;
  };
  function trialNetwork(edges) {
    if (!Array.isArray(edges) || edges.length > 2e4) throw new Error("Trial limit: 20,000 complete combinations. Narrow the scope; no truncation is used.");
    const ids = [...new Set(edges.flatMap((edge) => edge.members))].sort();
    if (ids.length > 800) throw new Error("Trial limit: 800 linked articles. Narrow the scope; no truncated network is used.");
    const positions = new Map(ids.map((id, index) => [id, index])), degree = Array(ids.length).fill(0), incidence = ids.map(() => []);
    let occurrences = 0;
    const groups = edges.map((edge, index) => {
      if (!Number.isFinite(edge.weight) || edge.weight <= 0 || edge.members.length < 2 || new Set(edge.members).size !== edge.members.length) throw new Error("Invalid weighted hyperedge");
      occurrences += edge.members.length;
      if (occurrences > 2e5) throw new Error("Trial incidence limit exceeded; no truncation is used.");
      const members = edge.members.map((id) => positions.get(id));
      for (const member of members) {
        degree[member] += edge.weight;
        incidence[member].push(index);
      }
      return { ...edge, members };
    });
    return { ids, groups, degree, incidence, volume: sum(degree), weight: sum(edges.map((edge) => edge.weight)) };
  }
  function normalizedOperator(network, vector) {
    const result = Array(network.ids.length).fill(0);
    for (const edge of network.groups) {
      const value = sum(edge.members.map((member) => vector[member] / Math.sqrt(network.degree[member]))) * edge.weight / edge.members.length;
      for (const member of edge.members) result[member] += value / Math.sqrt(network.degree[member]);
    }
    return result;
  }
  function spectralEigenspace(network, count) {
    if (!Number.isInteger(count) || count < 1 || count > network.ids.length) throw new Error("Invalid spectral dimension");
    const matrix2 = Matrix2.zeros(network.ids.length, network.ids.length), inverse2 = network.degree.map((value) => 1 / Math.sqrt(value));
    for (const edge of network.groups) for (const left of edge.members) for (const right of edge.members) matrix2.set(left, right, matrix2.get(left, right) + edge.weight / edge.members.length * inverse2[left] * inverse2[right]);
    const decomposition = new EigenvalueDecomposition2(matrix2, { assumeSymmetric: true }), values = decomposition.realEigenvalues, vectors = decomposition.eigenvectorMatrix;
    const order = values.map((_, index) => index).sort((left, right) => values[right] - values[left] || left - right), basis = order.slice(0, count).map((column) => vectors.getColumn(column));
    const residuals = basis.map((vector, index) => {
      const applied = normalizedOperator(network, vector), difference = applied.map((value, member) => value - values[order[index]] * vector[member]);
      return Math.sqrt(dot(difference, difference));
    });
    let orthogonalityError = 0;
    for (let left = 0; left < count; left++) for (let right = 0; right <= left; right++) orthogonalityError = Math.max(orthogonalityError, Math.abs(dot(basis[left], basis[right]) - Number(left === right)));
    const gap = count < order.length ? values[order[count - 1]] - values[order[count]] : null;
    return { basis, residual: Math.max(...residuals), eigenResiduals: residuals, orthogonalityError, boundaryGap: gap, converged: residuals.every((value) => Number.isFinite(value) && value <= 1e-8) && orthogonalityError <= 1e-8, engine: "ml-matrix 6.15.0 symmetric EVD", residualTolerance: 1e-8 };
  }
  function kmeans(points, count, random, starts = 3) {
    let best;
    for (let trial = 0; trial < starts; trial++) {
      const centers = [points[Math.floor(random() * points.length)].slice()];
      while (centers.length < count) {
        const distances = points.map((point) => Math.min(...centers.map((center) => sum(point.map((value, index) => (value - center[index]) ** 2)))));
        let threshold = random() * sum(distances), chosen = distances.length - 1;
        for (let index = 0; index < distances.length; index++) {
          threshold -= distances[index];
          if (threshold <= 0) {
            chosen = index;
            break;
          }
        }
        centers.push(points[chosen].slice());
      }
      let labels = points.map(() => -1), converged = false;
      for (let pass = 0; pass < 60; pass++) {
        const next = points.map((point) => {
          let selected = 0, distance = Infinity;
          centers.forEach((center, group) => {
            const candidate = sum(point.map((value, index) => (value - center[index]) ** 2));
            if (candidate < distance) {
              distance = candidate;
              selected = group;
            }
          });
          return selected;
        });
        const sizes = Array(count).fill(0);
        for (const group of next) sizes[group]++;
        for (let group = 0; group < count; group++) if (!sizes[group]) {
          let chosen = -1, distance = -1;
          points.forEach((point, index) => {
            const candidate = sum(point.map((value, column) => (value - centers[next[index]][column]) ** 2));
            if (sizes[next[index]] > 1 && candidate > distance) {
              chosen = index;
              distance = candidate;
            }
          });
          if (chosen < 0) throw new Error("Cannot retain requested nonempty groups");
          sizes[next[chosen]]--;
          next[chosen] = group;
          sizes[group]++;
        }
        if (next.every((group, index) => group === labels[index])) {
          converged = true;
          break;
        }
        labels = next;
        for (let group = 0; group < count; group++) centers[group] = points[0].map((_, column) => sum(points.map((point, index) => labels[index] === group ? point[column] : 0)) / sizes[group]);
      }
      const cost = sum(points.map((point, index) => sum(point.map((value, column) => (value - centers[labels[index]][column]) ** 2))));
      if (!best || cost < best.cost) best = { labels, cost, converged };
    }
    return best;
  }
  function componentSets(network) {
    const seen = /* @__PURE__ */ new Set(), components = [];
    for (let start = 0; start < network.ids.length; start++) if (!seen.has(start)) {
      const members = [], stack = [start];
      seen.add(start);
      while (stack.length) {
        const member = stack.pop();
        members.push(member);
        for (const edge of network.incidence[member]) for (const other of network.groups[edge].members) if (!seen.has(other)) {
          seen.add(other);
          stack.push(other);
        }
      }
      components.push(members.sort((left, right) => left - right));
    }
    return components;
  }
  function spectralFit(network, requested, random, progress) {
    const components = componentSets(network), allocation = components.map(() => 1), effective = Math.max(requested, components.length);
    for (let assigned = components.length; assigned < effective; assigned++) {
      let target = -1, best = -1;
      components.forEach((members, index) => {
        const priority = members.length / allocation[index];
        if (allocation[index] < members.length && priority > best) {
          target = index;
          best = priority;
        }
      });
      if (target < 0) break;
      allocation[target]++;
    }
    const labels = Array(network.ids.length), residuals = [], spectralDiagnostics = [];
    let offset = 0, converged = true;
    components.forEach((members, component) => {
      const count = allocation[component];
      progress("Spectral component " + (component + 1) + "/" + components.length);
      if (count === 1) {
        for (const member of members) labels[member] = offset;
        offset++;
        return;
      }
      const ids = new Set(members), sub = trialNetwork(network.groups.filter((edge) => ids.has(edge.members[0])).map((edge) => ({ ...edge, members: edge.members.map((member) => network.ids[member]) })));
      const eigenspace = spectralEigenspace(sub, count), { basis, ...diagnostics } = eigenspace;
      residuals.push(eigenspace.residual);
      spectralDiagnostics.push({ component: component + 1, articles: sub.ids.length, dimensions: count, ...diagnostics });
      if (!eigenspace.converged) converged = false;
      const points = sub.ids.map((_, index) => {
        const row = basis.map((column) => column[index]), norm = Math.sqrt(dot(row, row));
        return row.map((value) => value / (norm || 1));
      });
      const fitted = kmeans(points, count, random);
      spectralDiagnostics.at(-1).kmeansConverged = fitted.converged;
      if (!fitted.converged) converged = false;
      sub.ids.forEach((id, index) => {
        labels[network.ids.indexOf(id)] = offset + fitted.labels[index];
      });
      offset += count;
    });
    return { labels, converged, components: components.length, requestedGroups: requested, effectiveGroups: offset, subspaceResiduals: residuals, spectralDiagnostics, stoppingReason: converged ? "numerical-checks-passed" : "numerical-or-kmeans-limit" };
  }
  function cutCost(network, labels) {
    return sum(network.groups.map((edge) => edge.members.every((member) => labels[member] === labels[edge.members[0]]) ? 0 : edge.weight));
  }
  function normalizedCutCost(network, labels) {
    const volumes = /* @__PURE__ */ new Map(), boundary = /* @__PURE__ */ new Map();
    labels.forEach((group, index) => volumes.set(group, (volumes.get(group) || 0) + network.degree[index]));
    for (const edge of network.groups) {
      const counts = /* @__PURE__ */ new Map();
      for (const member of edge.members) counts.set(labels[member], (counts.get(labels[member]) || 0) + 1);
      for (const [group, count] of counts) boundary.set(group, (boundary.get(group) || 0) + edge.weight * count * (edge.members.length - count) / edge.members.length);
    }
    return sum([...volumes].map(([group, volume]) => (boundary.get(group) || 0) / volume));
  }
  function mutablePartition(network, labels) {
    const counts = network.groups.map((edge) => {
      const row = /* @__PURE__ */ new Map();
      for (const member of edge.members) row.set(labels[member], (row.get(labels[member]) || 0) + 1);
      return row;
    });
    const update = (member, target) => {
      const original = labels[member];
      for (const edge of network.incidence[member]) {
        const row = counts[edge], remaining = row.get(original) - 1;
        if (remaining) row.set(original, remaining);
        else row.delete(original);
        row.set(target, (row.get(target) || 0) + 1);
      }
      labels[member] = target;
    };
    return { counts, update };
  }
  function balancedMoveGain(network, labels, counts, member, target) {
    const original = labels[member];
    if (original === target) return 0;
    let gain = 0;
    for (const position of network.incidence[member]) {
      const groups = counts[position], after = groups.size - Number(groups.get(original) === 1) + Number(!groups.has(target));
      gain += network.groups[position].weight * (Number(groups.size > 1) - Number(after > 1));
    }
    return gain;
  }
  function balancedSwapGain(network, labels, counts, left, right, incidenceSets) {
    if (labels[left] === labels[right]) return 0;
    let gain = 0;
    for (const [member, other] of [[left, right], [right, left]]) for (const position of network.incidence[member]) {
      if (incidenceSets[other].has(position)) continue;
      const groups = counts[position], after = groups.size - Number(groups.get(labels[member]) === 1) + Number(!groups.has(labels[other]));
      gain += network.groups[position].weight * (Number(groups.size > 1) - Number(after > 1));
    }
    return gain;
  }
  function balancedFit(network, count, imbalance, random, starts, progress, maxPasses = 96, resumeMemberships = null) {
    const cap = Math.ceil(network.ids.length / count * (1 + imbalance)), indices = network.ids.map((_, index) => index), incidenceSets = network.incidence.map((edges) => new Set(edges));
    let best;
    for (let trial = 0; trial < starts; trial++) {
      const labels = Array(network.ids.length);
      if (trial === 0 && resumeMemberships) {
        const groups = [...new Set(Object.values(resumeMemberships))].sort((left, right) => left - right);
        if (groups.length !== count || Object.keys(resumeMemberships).length !== network.ids.length || network.ids.some((id) => !groups.includes(resumeMemberships[id]))) throw new Error("Continuation needs the same evidence and group count");
        for (const [index, id] of network.ids.entries()) labels[index] = groups.indexOf(resumeMemberships[id]);
      } else shuffle(indices, random).forEach((member, index) => {
        labels[member] = index % count;
      });
      const state = mutablePartition(network, labels), sizes = Array(count).fill(0);
      for (const group of labels) sizes[group]++;
      if (sizes.some((size) => size < 1 || size > cap)) throw new Error("Continuation violates the requested balance bounds");
      const gains = [], tolerance = 1e-10;
      let passes = 0, verified = false, remainingGain = null, verificationChecks = 0;
      const bestMove = (member) => {
        const original = labels[member];
        let target = original, gain = tolerance;
        if (sizes[original] > 1) {
          for (let group = 0; group < count; group++) if (group !== original && sizes[group] < cap) {
            const improvement = balancedMoveGain(network, labels, state.counts, member, group);
            if (improvement > gain) {
              target = group;
              gain = improvement;
            }
          }
        }
        return { member, target, gain };
      };
      const move = (proposal) => {
        const original = labels[proposal.member];
        state.update(proposal.member, proposal.target);
        sizes[original]--;
        sizes[proposal.target]++;
      };
      const swap = (left, right) => {
        const original = labels[left], target = labels[right];
        state.update(left, target);
        state.update(right, original);
      };
      const verify = () => {
        verificationChecks++;
        for (const member of indices) {
          const proposal = bestMove(member);
          if (proposal.target !== labels[member]) return { kind: "move", ...proposal };
        }
        for (let left = 0; left < indices.length; left++) for (let right = left + 1; right < indices.length; right++) if (labels[left] !== labels[right]) {
          const gain = balancedSwapGain(network, labels, state.counts, left, right, incidenceSets);
          if (gain > tolerance) return { kind: "swap", left, right, gain };
        }
        return null;
      };
      for (; passes < maxPasses; ) {
        passes++;
        progress("Balanced cut \xB7 start " + (trial + 1) + "/" + starts + " \xB7 round " + passes + "/" + maxPasses);
        let changed = false;
        for (const member of shuffle(indices, random)) {
          const proposal = bestMove(member);
          if (proposal.target !== labels[member]) {
            move(proposal);
            changed = true;
            continue;
          }
          const partners = shuffle(indices.filter((other) => labels[other] !== labels[member]), random).slice(0, 12);
          for (const other of partners) if (balancedSwapGain(network, labels, state.counts, member, other, incidenceSets) > tolerance) {
            swap(member, other);
            changed = true;
            break;
          }
        }
        gains.push(cutCost(network, labels));
        if (!changed) {
          const improvement = verify();
          if (!improvement) {
            verified = true;
            break;
          }
          if (improvement.kind === "move") move(improvement);
          else swap(improvement.left, improvement.right);
        }
      }
      if (!verified) {
        const improvement = verify();
        verified = !improvement;
        remainingGain = improvement?.gain ?? null;
      }
      const quality = cutCost(network, labels);
      if (!best || quality < best.quality - 1e-10 || Math.abs(quality - best.quality) <= 1e-10 && verified && !best.converged) best = { labels: [...labels], quality, converged: verified, passes, maximumGroupSize: cap, imbalance, requestedGroups: count, passBudget: maxPasses, verificationChecks, remainingImprovement: remainingGain, stoppingReason: verified ? "all-feasible-single-moves-and-swaps-stable" : "round-budget", cutHistory: gains, moveTolerance: tolerance };
    }
    return best;
  }
  function aonProfile(network, labels) {
    const volumes = /* @__PURE__ */ new Map(), sizes = /* @__PURE__ */ new Map();
    labels.forEach((group, index) => volumes.set(group, (volumes.get(group) || 0) + network.degree[index]));
    for (const edge of network.groups) {
      if (!sizes.has(edge.members.length)) sizes.set(edge.members.length, { total: 0, inside: 0 });
      const size = sizes.get(edge.members.length);
      size.total += edge.weight;
      if (edge.members.every((member) => labels[member] === labels[edge.members[0]])) size.inside += edge.weight;
    }
    return profileValue(network, volumes, sizes);
  }
  function profileValue(network, volumes, sizes) {
    let total = 0;
    for (const [size, counts] of sizes) {
      const mass = sum([...volumes.values()].map((volume) => (volume / network.volume) ** size)), fraction = counts.inside / counts.total;
      if (fraction <= mass + 1e-12) continue;
      if (counts.inside > 0) total += counts.inside * Math.log(fraction / Math.max(1e-300, mass));
      const outside = Math.max(0, counts.total - counts.inside);
      if (outside > 0) total += outside * Math.log(outside / counts.total / Math.max(1e-300, 1 - mass));
    }
    return total;
  }
  function aonFit(network, count, random, starts, progress) {
    let best;
    for (let trial = 0; trial < starts; trial++) {
      progress("AON approximation \xB7 start " + (trial + 1) + "/" + starts);
      const labels = trial === 0 ? spectralFit(network, count, random, () => {
      }).labels : network.ids.map(() => Math.floor(random() * count));
      const present = new Set(labels);
      for (let group = 0; group < count; group++) if (!present.has(group)) {
        const sizes2 = labels.map((label) => labels.filter((other) => other === label).length), member = sizes2.indexOf(Math.max(...sizes2));
        labels[member] = group;
        present.add(group);
      }
      const state = mutablePartition(network, labels), volumes = /* @__PURE__ */ new Map(), sizes = /* @__PURE__ */ new Map(), members = /* @__PURE__ */ new Map();
      labels.forEach((group, index) => {
        volumes.set(group, (volumes.get(group) || 0) + network.degree[index]);
        members.set(group, (members.get(group) || 0) + 1);
      });
      for (const [index, edge] of network.groups.entries()) {
        if (!sizes.has(edge.members.length)) sizes.set(edge.members.length, { total: 0, inside: 0 });
        sizes.get(edge.members.length).total += edge.weight;
        if (state.counts[index].size === 1) sizes.get(edge.members.length).inside += edge.weight;
      }
      const move = (member, target) => {
        const original = labels[member];
        for (const position of network.incidence[member]) {
          const edge = network.groups[position];
          if (state.counts[position].size === 1) sizes.get(edge.members.length).inside -= edge.weight;
        }
        state.update(member, target);
        for (const position of network.incidence[member]) {
          const edge = network.groups[position];
          if (state.counts[position].size === 1) sizes.get(edge.members.length).inside += edge.weight;
        }
        volumes.set(original, (volumes.get(original) || 0) - network.degree[member]);
        volumes.set(target, (volumes.get(target) || 0) + network.degree[member]);
      };
      let quality = profileValue(network, volumes, sizes), changed = false, passes = 0;
      for (; passes < 15; passes++) {
        changed = false;
        for (const member of shuffle(network.ids.map((_, index) => index), random)) {
          const original = labels[member];
          if (members.get(original) <= 1) continue;
          let target = original, value = quality + 1e-9;
          const candidates = /* @__PURE__ */ new Set();
          for (const edge of network.incidence[member]) for (const group of state.counts[edge].keys()) candidates.add(group);
          for (const group of candidates) if (group !== original) {
            move(member, group);
            const score = profileValue(network, volumes, sizes);
            move(member, original);
            if (score > value) {
              target = group;
              value = score;
            }
          }
          if (target !== original) {
            move(member, target);
            members.set(original, members.get(original) - 1);
            members.set(target, (members.get(target) || 0) + 1);
            quality = profileValue(network, volumes, sizes);
            changed = true;
          }
        }
        if (!changed) break;
      }
      quality = aonProfile(network, labels);
      if (!best || quality > best.quality) best = { labels: [...labels], quality, converged: !changed, passes, requestedGroups: count, propensities: "Fixed weighted degree / total volume; not jointly estimated", weightInterpretation: "Fractional source-normalized weights: quasi-likelihood, not literal Poisson counts" };
    }
    return best;
  }
  function localFit(network, seedId, restart) {
    const seed = network.ids.indexOf(seedId);
    if (seed < 0) return { labels: network.ids.map(() => -1), quality: null, converged: true, seedId, seedAbsent: true };
    let probabilities = network.ids.map((_, index) => Number(index === seed)), residual = Infinity, iterations = 0;
    for (; iterations < 1e3; iterations++) {
      const next = network.ids.map((_, index) => index === seed ? restart : 0);
      for (const edge of network.groups) {
        const mass = sum(edge.members.map((member) => probabilities[member] / network.degree[member])) * edge.weight / edge.members.length * (1 - restart);
        for (const member of edge.members) next[member] += mass;
      }
      residual = sum(next.map((value, index) => Math.abs(value - probabilities[index])));
      probabilities = next;
      if (residual < 1e-9) break;
    }
    const order = network.ids.map((_, index) => index).sort((left, right) => probabilities[right] / network.degree[right] - probabilities[left] / network.degree[left] || left - right), inside = /* @__PURE__ */ new Set();
    let volume = 0, best;
    for (const member of order) {
      inside.add(member);
      volume += network.degree[member];
      if (!inside.has(seed) || volume > network.volume / 2) continue;
      const cut = sum(network.groups.map((edge) => {
        const count = edge.members.filter((node) => inside.has(node)).length;
        return count > 0 && count < edge.members.length ? edge.weight : 0;
      }));
      const quality = cut / Math.min(volume, network.volume - volume);
      if (!best || quality < best.quality - 1e-12) best = { inside: new Set(inside), quality };
    }
    if (!best) best = { inside: /* @__PURE__ */ new Set([seed]), quality: sum(network.incidence[seed].map((edge) => network.groups[edge].weight)) / Math.max(1e-300, Math.min(network.degree[seed], network.volume - network.degree[seed])) };
    return { labels: network.ids.map((_, index) => best.inside.has(index) ? 0 : -1), quality: best.quality, converged: residual < 1e-9, seedId, restart, iterations, residual, probabilityMass: sum(probabilities), localOnly: true };
  }
  function periodCategories(edges, articles) {
    return edges.map((edge) => {
      const counts = /* @__PURE__ */ new Map();
      for (const id of edge.articles || []) {
        const year = articles[id]?.year;
        if (Number.isInteger(year) && year >= 1e3 && year <= 3e3) {
          const decade = Math.floor(year / 10) * 10;
          counts.set(decade, (counts.get(decade) || 0) + 1);
        }
      }
      const sorted = [...counts].sort((left, right) => right[1] - left[1] || left[0] - right[0]);
      return sorted.length ? { ...edge, category: String(sorted[0][0]) + "s", categoryEvidence: { counts: Object.fromEntries(sorted), rule: "Most frequent supporting-source decade; ties choose earlier" } } : null;
    }).filter(Boolean);
  }
  function categoricalFit(network, random, starts) {
    const categories = [...new Set(network.groups.map((edge) => edge.category))].sort();
    if (!categories.length || network.groups.some((edge) => !edge.category)) throw new Error("Categorical clustering needs explicit edge categories");
    let best;
    const score = (edge, labels) => edge.members.every((member) => labels[member] === categories.indexOf(edge.category)) ? edge.weight : 0;
    for (let trial = 0; trial < starts; trial++) {
      const labels = network.ids.map((_, member) => {
        const votes = categories.map((category) => sum(network.incidence[member].map((index) => network.groups[index].category === category ? network.groups[index].weight : 0)));
        return trial === 0 ? votes.indexOf(Math.max(...votes)) : Math.floor(random() * categories.length);
      });
      let changed = false, passes = 0;
      for (; passes < 20; passes++) {
        changed = false;
        for (const member of shuffle(network.ids.map((_, index) => index), random)) {
          const original = labels[member], adjacent = network.incidence[member];
          let target = original, bestScore = sum(adjacent.map((edge) => score(network.groups[edge], labels))) + 1e-10;
          for (let group = 0; group < categories.length; group++) {
            labels[member] = group;
            const quality2 = sum(adjacent.map((edge) => score(network.groups[edge], labels)));
            if (quality2 > bestScore) {
              bestScore = quality2;
              target = group;
            }
          }
          labels[member] = target;
          if (target !== original) changed = true;
        }
        if (!changed) break;
      }
      const quality = sum(network.groups.map((edge) => score(edge, labels)));
      if (!best || quality > best.quality) best = { labels: [...labels], quality, converged: !changed, passes, categories };
    }
    return best;
  }
  function runHypergraphTrial(edges, options = {}, progress = () => {
  }) {
    const family = options.family || "spectral", definition = TRIAL_METHODS[family];
    if (!definition) throw new Error("Unknown trial family");
    const network = trialNetwork(edges);
    if (!network.ids.length) throw new Error("No supported combinations at these settings.");
    const count = options.k ?? 24, seed = options.seed ?? 42, starts = options.starts ?? 3;
    if (!Number.isInteger(count) || count < 2 || count > 80 || !Number.isInteger(seed) || seed < 1 || !Number.isInteger(starts) || starts < 1 || starts > 5) throw new Error("Choose k 2\u201380, 1\u20135 starts and a positive integer seed");
    const effective = Math.min(count, network.ids.length), random = rng(seed), imbalance = options.imbalance ?? 0.2, restart = options.restart ?? 0.15;
    const balancedMaxPasses = options.balancedMaxPasses ?? 96;
    if (!Number.isInteger(balancedMaxPasses) || balancedMaxPasses < 1 || balancedMaxPasses > 512) throw new Error("Choose a balanced refinement budget of 1\u2013512 rounds");
    if (!Number.isFinite(imbalance) || imbalance < 0 || imbalance > 1 || !Number.isFinite(restart) || restart <= 0 || restart >= 1) throw new Error("Invalid balance or restart setting");
    let fitted;
    if (family === "spectral") {
      fitted = spectralFit(network, effective, random, progress);
      fitted.quality = normalizedCutCost(network, fitted.labels);
    }
    if (family === "aon") fitted = aonFit(network, effective, random, starts, progress);
    if (family === "balanced") fitted = balancedFit(network, effective, imbalance, random, starts, progress, balancedMaxPasses, options.resumeMemberships);
    if (family === "local") fitted = localFit(network, options.seedId, restart);
    if (family === "categorical") fitted = categoricalFit(network, random, starts);
    const memberships = canonicalMemberships(Object.fromEntries(network.ids.flatMap((id, index) => fitted.labels[index] < 0 ? [] : [[id, fitted.labels[index] + 1]]))), { labels, ...diagnostics } = fitted;
    const { resumeMemberships, ...recordedSettings } = options;
    const categoryByCluster = family === "categorical" ? Object.fromEntries(network.ids.map((id, index) => [memberships[id], fitted.categories[labels[index]]])) : null;
    return { ...diagnostics, memberships, categoryByCluster, family, version: TRIAL_VERSION, continuation: resumeMemberships ? { initialMemberships: resumeMemberships, rule: "Continue the same pinned evidence and bounds; resampling checks restart without the checkpoint" } : null, settings: { ...recordedSettings, family, k: count, seed, starts, imbalance, restart, balancedMaxPasses }, definition, linkedArticles: network.ids.length, combinations: network.groups.length, weight: network.weight, clusters: new Set(Object.values(memberships)).size, qualityDirection: ["spectral", "balanced", "local"].includes(family) ? "lower" : "higher", limitations: definition.help + " Bounded experimental solver; no claim of global optimality or thematic validity. Quality values are not comparable across families." };
  }

  // scripts/evidence-metrics.mjs
  function clusterRecovery(original, sampled) {
    const base = /* @__PURE__ */ new Map(), next = /* @__PURE__ */ new Map();
    for (const [id, cluster] of Object.entries(original)) if (+cluster > 0) {
      if (!base.has(cluster)) base.set(cluster, /* @__PURE__ */ new Set());
      base.get(cluster).add(id);
    }
    for (const [id, cluster] of Object.entries(sampled)) if (+cluster > 0) {
      if (!next.has(cluster)) next.set(cluster, /* @__PURE__ */ new Set());
      next.get(cluster).add(id);
    }
    const results = {};
    for (const [cluster, members] of base) {
      let best = 0, retained = 0;
      for (const id of members) if (+sampled[id] > 0) retained++;
      for (const candidates of next.values()) {
        let overlap = 0;
        for (const id of members) if (candidates.has(id)) overlap++;
        best = Math.max(best, overlap / (members.size + candidates.size - overlap));
      }
      results[cluster] = { jaccard: best, retention: retained / members.size, size: members.size };
    }
    return results;
  }
  function bootstrapWeights(ids, sample) {
    let seed = 20261016 + sample;
    const weights = {};
    for (let draw = 0; draw < ids.length; draw++) {
      seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
      const id = ids[Math.floor(seed / 4294967296 * ids.length)];
      weights[id] = (weights[id] || 0) + 1;
    }
    return weights;
  }
  function summarizeRecovery(samples) {
    const output = {}, quantile = (values, fraction) => {
      const sorted = [...values].sort((left, right) => left - right), offset = (sorted.length - 1) * fraction, index = Math.floor(offset);
      return sorted[index] + (sorted[Math.min(index + 1, sorted.length - 1)] - sorted[index]) * (offset - index);
    };
    for (const cluster of Object.keys(samples[0] || {})) {
      const records = samples.map((sample) => sample[cluster]), values = records.map((record) => record.jaccard);
      output[cluster] = { size: records[0].size, meanJaccard: values.reduce((sum2, value) => sum2 + value, 0) / values.length, interval: [quantile(values, 0.1), quantile(values, 0.9)], meanRetention: records.reduce((sum2, record) => sum2 + record.retention, 0) / records.length };
    }
    return output;
  }

  // scripts/network-reliability.mjs
  function resampleHyperedges(edges, weights, minimumSupport) {
    const retained = edges.filter((edge) => edge.articles.reduce((sum2, id) => sum2 + (weights[id] || 0), 0) >= minimumSupport);
    const occurrences = /* @__PURE__ */ new Map();
    for (const edge of retained) for (const id of edge.articles) occurrences.set(id, (occurrences.get(id) || 0) + 1);
    return retained.map((edge) => ({ ...edge, weight: edge.articles.reduce((sum2, id) => sum2 + (weights[id] || 0) / occurrences.get(id), 0) }));
  }

  // scripts/hypergraph-trials-worker.mjs
  self.onmessage = (event) => {
    try {
      const { graph, bundles, articles, options, action, result } = event.data;
      const samples = event.data.samples ?? 10;
      if (action === "check" && ![10, 50].includes(samples)) throw new Error("Choose 10 or 50 resamples.");
      const progress = (text) => self.postMessage({ progress: text });
      progress("Reconstructing complete supported combinations\u2026");
      const allEdges = buildHyperedges(graph, bundles), edges = options.family === "categorical" ? periodCategories(allEdges, articles) : allEdges;
      if (action !== "check") {
        const fitted = runHypergraphTrial(edges, options, progress);
        self.postMessage({ result: fitted, coverage: { allCombinations: allEdges.length, includedCombinations: edges.length }, edges });
        return;
      }
      if (result.version !== TRIAL_VERSION) throw new Error("The trial engine has changed. Run this trial again before checking evidence.");
      const sourceIds = Object.keys(articles), outcomes = [];
      let nonconverged = 0;
      for (let sample = 0; sample < samples; sample++) {
        progress("Evidence check " + (sample + 1) + "/" + samples + " \xB7 " + options.family);
        const retained = resampleHyperedges(edges, bootstrapWeights(sourceIds, sample + 2e3), graph.minimumSupport || 5);
        if (!retained.length) {
          outcomes.push(clusterRecovery(result.memberships, {}));
          continue;
        }
        const fitted = runHypergraphTrial(retained, { ...result.settings, starts: 1, seed: 42 + sample });
        if (!fitted.converged) nonconverged++;
        outcomes.push(clusterRecovery(result.memberships, fitted.memberships));
      }
      self.postMessage({ audit: { version: TRIAL_VERSION, algorithm: "trial", samples, preliminary: samples < 50, clusters: summarizeRecovery(outcomes), nonconverged, method: result.definition.name, restarts: 1, resamplingUnit: "citing source article, conditional on discovered combinations", settings: result.settings, limitations: "Conditional source bootstraps; support and source-normalized weights rebuilt on discovered combinations. One search start per resample; optimization variability is included. Fixed k may be clipped to retained nodes and spectral k may increase to retain disconnected components. Period categories stay fixed. Not thematic validation or a settings recommendation." } });
    } catch (error) {
      self.postMessage({ error: analysisErrorMessage(error) });
    }
  };
})();
