# Example demonstrating vivafolio_data!() construct for inventory management
# This shows how to embed tabular data in Python source files

vivafolio_data!("product_inventory", r#"
Product Name,SKU,Category,Stock Quantity,Unit Price,Supplier
Wireless Mouse,WMS-001,Electronics,150,25.99,TechCorp
Mechanical Keyboard,KBD-002,Electronics,75,89.99,KeyMasters
USB Cable,USB-003,Accessories,300,12.50,CableCo
Monitor Stand,MST-004,Accessories,45,34.99,OfficePlus
Webcam,WBC-005,Electronics,60,49.99,VisualTech
"#);

vivafolio_data!("suppliers", r#"
Supplier Name,Contact Email,Phone,Address
TechCorp,orders@techcorp.com,+1-555-0101,123 Tech Street
KeyMasters,sales@keymasters.com,+1-555-0102,456 Keyboard Ave
CableCo,info@cableco.com,+1-555-0103,789 Wire Boulevard
OfficePlus,support@officeplus.com,+1-555-0104,321 Desk Drive
VisualTech,contact@visualtech.com,+1-555-0105,654 Camera Lane
"#);

# Regular Python code continues...
def calculate_inventory_value():
    """Calculate total value of inventory"""
    # This function would work with the data above
    pass

if __name__ == "__main__":
    print("Inventory management system")
