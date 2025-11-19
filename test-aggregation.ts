import { useStore } from './src/lib/store';
import { Recipe } from './src/types';
import assert from 'assert';

// Mock recipes
const recipe1: Recipe = {
    id: '1',
    title: 'Burger',
    description: 'Desc',
    ingredients: [
        { name: 'Ground Beef', amount: 1, unit: 'lb' },
        { name: 'Onion', amount: 1, unit: 'count' }
    ],
    instructions: [],
    tags: { cuisine: 'American', meal: 'Dinner', protein: 'Ground Beef' },
    prepTime: '10m',
    cookTime: '10m'
};

const recipe2: Recipe = {
    id: '2',
    title: 'Stroganoff',
    description: 'Desc',
    ingredients: [
        { name: 'Ground Beef', amount: 1, unit: 'lb' },
        { name: 'Mushroom', amount: 8, unit: 'oz' }
    ],
    instructions: [],
    tags: { cuisine: 'American', meal: 'Dinner', protein: 'Ground Beef' },
    prepTime: '10m',
    cookTime: '10m'
};

console.log('Running Aggregation Test...');

const store = useStore.getState();

// Test 1: Add Recipe 1
store.saveRecipe(recipe1);
let groceryList = useStore.getState().groceryList;
assert.strictEqual(groceryList.length, 2, 'Should have 2 items');
assert.strictEqual(groceryList.find(i => i.name === 'Ground Beef')?.amount, 1, 'Beef should be 1 lb');

// Test 2: Add Recipe 2 (Should aggregate Beef)
store.saveRecipe(recipe2);
groceryList = useStore.getState().groceryList;

// Debug output
// console.log(groceryList);

const beef = groceryList.find(i => i.name === 'Ground Beef');
assert.ok(beef, 'Beef should exist');
assert.strictEqual(beef?.amount, 2, 'Beef should be 2 lbs (1+1)');
assert.strictEqual(groceryList.length, 3, 'Should have 3 items total (Beef, Onion, Mushroom)');

console.log('✅ Aggregation Test Passed!');
