// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// ====================================================================
// 1. LIBRARIES
// A collection of reusable utility functions.
// ====================================================================

/**
 * @dev Wrappers over Solidity's arithmetic operations with added overflow checks.
 */
library SafeMath {
    function add(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 c = a + b;
        require(c >= a, "SafeMath: addition overflow");
        return c;
    }

    function sub(uint256 a, uint256 b) internal pure returns (uint256) {
        return sub(a, b, "SafeMath: subtraction overflow");
    }

    function sub(uint256 a, uint256 b, string memory errorMessage) internal pure returns (uint256) {
        require(b <= a, errorMessage);
        uint256 c = a - b;
        return c;
    }

    function mul(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a == 0) {
            return 0;
        }
        uint256 c = a * b;
        require(c / a == b, "SafeMath: multiplication overflow");
        return c;
    }

    function div(uint256 a, uint256 b) internal pure returns (uint256) {
        return div(a, b, "SafeMath: division by zero");
    }

    function div(uint256 a, uint256 b, string memory errorMessage) internal pure returns (uint256) {
        require(b > 0, errorMessage);
        uint256 c = a / b;
        return c;
    }
}

/**
 * @dev Standard math utilities missing in the Solidity language.
 */
library Math {
    function max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a >= b ? a : b;
    }

    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function average(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a / 2) + (b / 2) + ((a % 2 + b % 2) / 2);
    }
}

/**
 * @dev Provides counters that can only be incremented or decremented by one.
 */
library Counters {
    using SafeMath for uint256;
    struct Counter {
        uint256 _value;
    }

    function current(Counter storage counter) internal view returns (uint256) {
        return counter._value;
    }

    function increment(Counter storage counter) internal {
        counter._value += 1;
    }

    function decrement(Counter storage counter) internal {
        counter._value = counter._value.sub(1);
    }
}

/**
 * @dev Collection of functions related to array types.
 */
library Arrays {
    function findUpperBound(uint256[] storage array, uint256 element) internal view returns (uint256) {
        if (array.length == 0) {
            return 0;
        }
        uint256 low = 0;
        uint256 high = array.length;
        while (low < high) {
            uint256 mid = Math.average(low, high);
            if (array[mid] > element) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }
        if (low > 0 && array[low - 1] == element) {
            return low - 1;
        } else {
            return low;
        }
    }
}

// ====================================================================
// 2. INTERFACES
// Defines the function signatures required for TRC20 compliance.
// ====================================================================

interface ITRC20 {
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

abstract contract ExpandedITRC20 is ITRC20 {
    function burn(uint256 value) external virtual;
    function mint(address to, uint256 value) external virtual returns (bool);
}

// ====================================================================
// 3. BASE CONTRACTS
// Core logic for context, token implementation, and roles.
// ====================================================================

abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }
}

contract TRC20 is Context, ITRC20 {
    using SafeMath for uint256;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    uint256 private _totalSupply;

    function totalSupply() public view virtual override returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view virtual override returns (uint256) {
        return _balances[account];
    }

    function transfer(address recipient, uint256 amount) public virtual override returns (bool) {
        _transfer(_msgSender(), recipient, amount);
        return true;
    }

    function allowance(address owner, address spender) public view virtual override returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) public virtual override returns (bool) {
        _approve(_msgSender(), spender, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public virtual override returns (bool) {
        _transfer(sender, recipient, amount);
        uint256 currentAllowance = _allowances[sender][_msgSender()];
        require(currentAllowance >= amount, "TRC20: transfer amount exceeds allowance");
        _approve(sender, _msgSender(), currentAllowance - amount);
        return true;
    }

    function _transfer(address sender, address recipient, uint256 amount) internal virtual {
        require(sender != address(0), "TRC20: transfer from the zero address");
        require(recipient != address(0), "TRC20: transfer to the zero address");

        _balances[sender] = _balances[sender].sub(amount, "TRC20: transfer amount exceeds balance");
        _balances[recipient] = _balances[recipient].add(amount);
        emit Transfer(sender, recipient, amount);
    }

    function _mint(address account, uint256 amount) internal virtual {
        require(account != address(0), "TRC20: mint to the zero address");

        _totalSupply = _totalSupply.add(amount);
        _balances[account] = _balances[account].add(amount);
        emit Transfer(address(0), account, amount);
    }

    function _burn(address account, uint256 amount) internal virtual {
        require(account != address(0), "TRC20: burn from the zero address");

        _balances[account] = _balances[account].sub(amount, "TRC20: burn amount exceeds balance");
        _totalSupply = _totalSupply.sub(amount);
        emit Transfer(account, address(0), amount);
    }

    function _approve(address owner, address spender, uint256 amount) internal virtual {
        require(owner != address(0), "TRC20: approve from the zero address");
        require(spender != address(0), "TRC20: approve to the zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }
}

contract TRC20Snapshot is TRC20 {
    using Arrays for uint256[];
    using Counters for Counters.Counter;

    struct Snapshots {
        uint256[] ids;
        uint256[] values;
    }

    mapping(address => Snapshots) private _accountBalanceSnapshots;
    Snapshots private _totalSupplySnapshots;
    Counters.Counter private _currentSnapshotId;

    event Snapshot(uint256 id);

    function snapshot() public virtual returns (uint256) {
        _currentSnapshotId.increment();
        uint256 currentId = _currentSnapshotId.current();
        emit Snapshot(currentId);
        return currentId;
    }

    function balanceOfAt(address account, uint256 snapshotId) public view virtual returns (uint256) {
        (bool snapshotted, uint256 value) = _valueAt(snapshotId, _accountBalanceSnapshots[account]);
        return snapshotted ? value : balanceOf(account);
    }

    function totalSupplyAt(uint256 snapshotId) public view virtual returns (uint256) {
        (bool snapshotted, uint256 value) = _valueAt(snapshotId, _totalSupplySnapshots);
        return snapshotted ? value : totalSupply();
    }

    function _transfer(address from, address to, uint256 amount) internal virtual override {
        _updateAccountSnapshot(from);
        _updateAccountSnapshot(to);
        super._transfer(from, to, amount);
    }

    function _mint(address account, uint256 amount) internal virtual override {
        _updateAccountSnapshot(account);
        _updateTotalSupplySnapshot();
        super._mint(account, amount);
    }

    function _burn(address account, uint256 amount) internal virtual override {
        _updateAccountSnapshot(account);
        _updateTotalSupplySnapshot();
        super._burn(account, amount);
    }
    
    function _valueAt(uint256 snapshotId, Snapshots storage snapshots) private view returns (bool, uint256) {
        require(snapshotId > 0, "TRC20Snapshot: id is 0");
        require(snapshotId <= _currentSnapshotId.current(), "TRC20Snapshot: nonexistent id");
        uint256 index = snapshots.ids.findUpperBound(snapshotId);
        if (index == snapshots.ids.length) {
            return (false, 0);
        } else {
            return (true, snapshots.values[index]);
        }
    }
    
    function _updateAccountSnapshot(address account) private {
        _updateSnapshot(_accountBalanceSnapshots[account], balanceOf(account));
    }

    function _updateTotalSupplySnapshot() private {
        _updateSnapshot(_totalSupplySnapshots, totalSupply());
    }

    function _updateSnapshot(Snapshots storage snapshots, uint256 currentValue) private {
        uint256 currentId = _currentSnapshotId.current();
        if (_lastSnapshotId(snapshots.ids) < currentId) {
            snapshots.ids.push(currentId);
            snapshots.values.push(currentValue);
        }
    }

    function _lastSnapshotId(uint256[] storage ids) private view returns (uint256) {
        if (ids.length == 0) {
            return 0;
        } else {
            return ids[ids.length - 1];
        }
    }
}

library Exclusive {
    struct RoleMembership { address member; }
    function isMember(RoleMembership storage r, address m) internal view returns (bool) { return r.member == m; }
    function resetMember(RoleMembership storage r, address n) internal { require(n != address(0x0)); r.member = n; }
    function getMember(RoleMembership storage r) internal view returns (address) { return r.member; }
    function init(RoleMembership storage r, address i) internal { resetMember(r, i); }
}

library Shared {
    struct RoleMembership { mapping(address => bool) members; }
    function isMember(RoleMembership storage r, address m) internal view returns (bool) { return r.members[m]; }
    function addMember(RoleMembership storage r, address m) internal { r.members[m] = true; }
    function removeMember(RoleMembership storage r, address m) internal { r.members[m] = false; }
    function init(RoleMembership storage r, address[] memory i) internal { for (uint j = 0; j < i.length; j++) { addMember(r, i[j]); } }
}

contract MultiRole {
    using Exclusive for Exclusive.RoleMembership;
    using Shared for Shared.RoleMembership;

    enum RoleType { Invalid, Exclusive, Shared }
    struct Role {
        uint256 managingRole;
        RoleType roleType;
        Exclusive.RoleMembership exclusiveRoleMembership;
        Shared.RoleMembership sharedRoleMembership;
    }
    mapping(uint256 => Role) private roles;

    modifier onlyRoleHolder(uint256 roleId) { require(holdsRole(roleId, msg.sender), "Sender does not hold required role"); _; }
    modifier onlyRoleManager(uint256 roleId) { require(holdsRole(roles[roleId].managingRole, msg.sender), "Can only be called by a role manager"); _; }
    modifier onlyExclusive(uint256 roleId) { require(roles[roleId].roleType == RoleType.Exclusive, "Must be called on an initialized Exclusive role"); _; }
    modifier onlyShared(uint256 roleId) { require(roles[roleId].roleType == RoleType.Shared, "Must be called on an initialized Shared role"); _; }
    modifier onlyInvalidRole(uint256 roleId) { require(roles[roleId].roleType == RoleType.Invalid, "Cannot use a pre-existing role"); _; }

    function holdsRole(uint256 roleId, address memberToCheck) public view returns (bool) {
        Role storage role = roles[roleId];
        if (role.roleType == RoleType.Exclusive) return role.exclusiveRoleMembership.isMember(memberToCheck);
        else if (role.roleType == RoleType.Shared) return role.sharedRoleMembership.isMember(memberToCheck);
        revert("Invalid roleId");
    }
    function resetMember(uint256 roleId, address newMember) public onlyExclusive(roleId) onlyRoleManager(roleId) { roles[roleId].exclusiveRoleMembership.resetMember(newMember); }
    function getMember(uint256 roleId) public view onlyExclusive(roleId) returns (address) { return roles[roleId].exclusiveRoleMembership.getMember(); }
    function addMember(uint256 roleId, address newMember) public onlyShared(roleId) onlyRoleManager(roleId) { roles[roleId].sharedRoleMembership.addMember(newMember); }
    function removeMember(uint256 roleId, address memberToRemove) public onlyShared(roleId) onlyRoleManager(roleId) { roles[roleId].sharedRoleMembership.removeMember(memberToRemove); }
    
    function _createSharedRole(uint256 roleId, uint256 managingRoleId, address[] memory initialMembers) internal onlyInvalidRole(roleId) {
        Role storage role = roles[roleId];
        role.roleType = RoleType.Shared;
        role.managingRole = managingRoleId;
        role.sharedRoleMembership.init(initialMembers);
        require(roles[managingRoleId].roleType != RoleType.Invalid, "Invalid managing role");
    }
    function _createExclusiveRole(uint256 roleId, uint256 managingRoleId, address initialMember) internal onlyInvalidRole(roleId) {
        Role storage role = roles[roleId];
        role.roleType = RoleType.Exclusive;
        role.managingRole = managingRoleId;
        role.exclusiveRoleMembership.init(initialMember);
        require(roles[managingRoleId].roleType != RoleType.Invalid, "Invalid managing role");
    }
}

// ====================================================================
// 4. FINAL TOKEN CONTRACT
// The deployable contract that inherits all necessary features.
// ====================================================================

/**
 * @title DelphiToken
 * @dev TRON-compatible inflationary governance token with snapshot and multi-role capabilities.
 */
contract DelphiToken is ExpandedITRC20, TRC20Snapshot, MultiRole {
    enum Roles { Owner, Minter, Burner }

    string public constant name = "Delphi Voting Token v1";
    string public constant symbol = "DELPHI";
    uint8 public constant decimals = 18;

    constructor() {
        _createExclusiveRole(uint256(Roles.Owner), uint256(Roles.Owner), msg.sender);
        _createSharedRole(uint256(Roles.Minter), uint256(Roles.Owner), new address[](0));
        _createSharedRole(uint256(Roles.Burner), uint256(Roles.Owner), new address[](0));
    }

    /**
     * @dev Mints `value` tokens to `recipient`. Can only be called by a Minter.
     */
    function mint(address recipient, uint256 value) public virtual override onlyRoleHolder(uint256(Roles.Minter)) returns (bool) {
        _mint(recipient, value);
        return true;
    }

    /**
     * @dev Burns `value` tokens from the caller's account. Can only be called by a Burner.
     */
    function burn(uint256 value) public virtual override onlyRoleHolder(uint256(Roles.Burner)) {
        _burn(msg.sender, value);
    }
}
