export function numbersNearlyMatch(num1: number, num2: number, tolerance: number) {
    return Math.abs(num1 - num2) < tolerance;
}

export function roundToDecimalPlace(num: number, decimalPlaces: number) {
    return Math.round(num * Math.pow(10, decimalPlaces)) / Math.pow(10, decimalPlaces);
}
