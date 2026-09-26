package com.tridi.market.ui

import com.tridi.market.data.ProductEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CatalogBehaviorTest {
    private val water = ProductEntity(
        id = 10,
        name = "Água Mineral 500ml",
        barcode = "789100000010",
        price = 2.5,
        imageUrl = null,
        categoryName = "Bebidas",
        stock = 12,
        minimumStock = 4,
        active = true,
        snapshotAt = 1L,
    )
    private val snack = ProductEntity(
        id = 11,
        name = "Salgadinho Queijo 50g",
        barcode = "789100000011",
        price = 5.5,
        imageUrl = null,
        categoryName = "Lanches",
        stock = 8,
        minimumStock = 3,
        active = true,
        snapshotAt = 1L,
    )

    @Test fun searchMatchesNameButNeverBarcode() {
        assertEquals(listOf(water), filterProductsByName(listOf(water), "mineral"))
        assertEquals(emptyList<ProductEntity>(), filterProductsByName(listOf(water), "789100"))
    }

    @Test fun tappingProductOnlyRequestsConfirmation() {
        val transition = reduceCatalogInteraction(
            CatalogInteractionState(),
            CatalogAction.RequestAdd(water.id),
        )

        assertEquals(water.id, transition.state.pendingProductId)
        assertNull(transition.productToAdd)
    }

    @Test fun confirmingAddsPendingProductAndClosesConfirmation() {
        val transition = reduceCatalogInteraction(
            CatalogInteractionState(pendingProductId = water.id),
            CatalogAction.ConfirmAdd,
        )

        assertNull(transition.state.pendingProductId)
        assertEquals(water.id, transition.productToAdd)
    }

    @Test fun cancellingClosesConfirmationWithoutAdding() {
        val transition = reduceCatalogInteraction(
            CatalogInteractionState(pendingProductId = water.id),
            CatalogAction.CancelAdd,
        )

        assertNull(transition.state.pendingProductId)
        assertNull(transition.productToAdd)
    }

    @Test fun categoriesAreUniqueSortedAndKeepAllFirst() {
        val duplicateWater = water.copy(id = 12, name = "Água com gás")

        assertEquals(
            listOf(null, "Bebidas", "Lanches"),
            catalogCategories(listOf(snack, duplicateWater, water)),
        )
    }

    @Test fun cartSummaryUsesQuantitiesAndPrices() {
        assertEquals(
            CartSummary(itemCount = 3, total = 13.5),
            summarizeCart(listOf(water, snack), mapOf(water.id to 1, snack.id to 2)),
        )
    }
}
